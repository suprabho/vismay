/**
 * Coke Studio lyrics fetcher — multi-source, quality-scored.
 *
 * For every row in coke_studio_songs without a cached lyrics record, fan
 * out across N sources (YouTube descriptions, LyricsTranslate, Genius — and
 * easy to add more) in parallel, score the survivors, upsert the winner
 * into coke_studio_song_lyrics. Songs no source could find are written to
 * vizmaya-data/coke-studio/lyrics-misses.csv for manual triage.
 *
 * Source-by-source: see scripts/coke-studio/sources/. Each source is a small
 * module behind a common interface. Sources without their auth env var
 * (e.g. GENIUS_CLIENT_ACCESS_TOKEN) skip themselves rather than block.
 *
 * Run locally:
 *   pnpm coke-studio:fetch-lyrics
 *   pnpm coke-studio:fetch-lyrics -- --season 1
 *   pnpm coke-studio:fetch-lyrics -- --limit 10 --dry-run
 *   pnpm coke-studio:fetch-lyrics -- --force        # refetch cached songs
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write access
 *
 * Optional env:
 *   GENIUS_CLIENT_ACCESS_TOKEN  — enables the Genius source. No token =
 *                                  Genius is skipped; YouTube + LT cover
 *                                  most of the corpus on their own.
 *
 * Picking: scoreCandidate = length + 1000 if has_native_script + 1000 if
 * has_translation. Longer + bilingual wins. See sources/utils.ts.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { createGeniusSource } from './sources/genius.js'
import { createYouTubeSource } from './sources/youtube.js'
import { createLyricsTranslateSource } from './sources/lyricstranslate.js'
import { detectScript, pickBest, scoreCandidate } from './sources/utils.js'
import type { LyricsCandidate, LyricsSource, SongRow, SourceName } from './sources/types.js'

// Path anchoring on script location — see PR #103 / commit 7619cb0.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR    = resolve(SCRIPT_DIR, '../../')
const REPO_ROOT  = resolve(SCRIPT_DIR, '../../../../')

loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

const DATA_DIR = resolve(REPO_ROOT, 'vizmaya-data/coke-studio')
const MISSES_CSV = resolve(DATA_DIR, 'lyrics-misses.csv')

// Per-song polite throttle — applies between songs, not within. Each song
// fires all sources concurrently, so a single song's wall time is the slowest
// source's latency. Sleeping between songs is what keeps each source under
// its rate limit (Genius is the strictest at 1 req/sec).
const PER_SONG_DELAY_MS = 1100

interface Cli {
  season: number | null
  limit: number | null
  dryRun: boolean
  force: boolean
}

function parseCli(): Cli {
  const args = process.argv.slice(2)
  const cli: Cli = { season: null, limit: null, dryRun: false, force: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--season') cli.season = Number(args[++i])
    else if (a === '--limit') cli.limit = Number(args[++i])
    else if (a === '--dry-run') cli.dryRun = true
    else if (a === '--force') cli.force = true
    else throw new Error(`unknown arg: ${a}`)
  }
  return cli
}

// ---- DB I/O ---------------------------------------------------------------

async function loadSongs(cli: Cli): Promise<SongRow[]> {
  const sb = createServiceClient()
  let q = sb
    .from('coke_studio_songs')
    .select('song_id,title,season,episode,track_in_episode,artists,notes')
    .order('season')
    .order('episode')
    .order('track_in_episode')
  if (cli.season !== null) q = q.eq('season', cli.season)
  if (cli.limit !== null) q = q.limit(cli.limit)
  const { data, error } = await q
  if (error) throw new Error(`load coke_studio_songs: ${error.message}`)
  return (data ?? []) as SongRow[]
}

async function loadCachedSongIds(): Promise<Set<string>> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coke_studio_song_lyrics')
    .select('song_id')
  if (error) throw new Error(`load coke_studio_song_lyrics: ${error.message}`)
  return new Set((data ?? []).map((r) => r.song_id as string))
}

async function upsertLyrics(songId: string, c: LyricsCandidate): Promise<void> {
  const sb = createServiceClient()
  const scriptHint = detectScript(c.raw_text).script_hint
  const { error } = await sb.from('coke_studio_song_lyrics').upsert(
    {
      song_id: songId,
      source: c.source,
      source_url: c.source_url,
      source_id: c.source_id,
      raw_text: c.raw_text,
      script_hint: scriptHint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'song_id', ignoreDuplicates: false },
  )
  if (error) throw new Error(`upsert coke_studio_song_lyrics ${songId}: ${error.message}`)
}

async function backfillYoutube(
  songId: string,
  youtubeUrl: string,
  durationSeconds: number | null | undefined,
): Promise<void> {
  const sb = createServiceClient()
  const patch: Record<string, unknown> = { youtube_url: youtubeUrl, updated_at: new Date().toISOString() }
  if (durationSeconds != null) patch.duration_seconds = durationSeconds
  const { error } = await sb.from('coke_studio_songs').update(patch).eq('song_id', songId)
  if (error) throw new Error(`backfill youtube_url ${songId}: ${error.message}`)
}

// ---- misses CSV -----------------------------------------------------------

function appendMiss(song: SongRow, reason: string): void {
  const header = 'song_id,title,season,episode,artists,reason,attempted_at\n'
  if (!existsSync(MISSES_CSV)) {
    mkdirSync(dirname(MISSES_CSV), { recursive: true })
    writeFileSync(MISSES_CSV, header)
  }
  const row = [
    song.song_id,
    JSON.stringify(song.title),
    song.season,
    song.episode ?? '',
    JSON.stringify(song.artists ?? ''),
    JSON.stringify(reason),
    new Date().toISOString(),
  ].join(',') + '\n'
  appendFileSync(MISSES_CSV, row)
}

function pruneMisses(songIds: string[]): void {
  if (!existsSync(MISSES_CSV)) return
  const remove = new Set(songIds)
  const lines = readFileSync(MISSES_CSV, 'utf8').split('\n')
  const kept = lines.filter((l, i) => {
    if (i === 0) return true
    const id = l.split(',')[0]
    return id && !remove.has(id)
  })
  writeFileSync(MISSES_CSV, kept.join('\n'))
}

// ---- multi-source fan-out -------------------------------------------------

interface PerSongResult {
  candidates: LyricsCandidate[]
  errors: { source: SourceName; message: string }[]
}

async function fetchAllSources(song: SongRow, sources: LyricsSource[]): Promise<PerSongResult> {
  const settled = await Promise.allSettled(sources.map((s) => s.fetch(song)))
  const candidates: LyricsCandidate[] = []
  const errors: { source: SourceName; message: string }[] = []
  for (let i = 0; i < settled.length; i++) {
    const s = sources[i]
    const r = settled[i]
    if (r.status === 'fulfilled' && r.value) candidates.push(r.value)
    else if (r.status === 'rejected') {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      errors.push({ source: s.name, message: msg })
    }
  }
  return { candidates, errors }
}

function summariseCandidates(candidates: LyricsCandidate[]): string {
  if (candidates.length === 0) return '0 sources'
  return candidates
    .map((c) => `${c.source}:${c.raw_text.length}ch${c.has_native_script ? '/N' : ''}${c.has_translation ? '/T' : ''}=${scoreCandidate(c)}`)
    .join(' ')
}

// ---- entry point ----------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const cli = parseCli()

  // Genius is opt-in via env var; YouTube + LT are always on.
  const sources: LyricsSource[] = [
    createYouTubeSource(),
    createLyricsTranslateSource(),
  ]
  const genius = createGeniusSource()
  if (genius) sources.push(genius)
  console.log(`[coke-studio:fetch-lyrics] sources enabled: ${sources.map((s) => s.name).join(', ')}`)

  const allSongs = await loadSongs(cli)
  const cached = cli.force ? new Set<string>() : await loadCachedSongIds()
  const todo = allSongs.filter((s) => !cached.has(s.song_id))

  console.log(
    `[coke-studio:fetch-lyrics] ${allSongs.length} songs in scope, ${cached.size} cached, ${todo.length} to fetch`,
  )

  if (cli.dryRun) {
    for (const s of todo.slice(0, 20)) {
      console.log(`  would fetch: ${s.song_id} | ${s.title} | ${s.artists ?? ''}`)
    }
    if (todo.length > 20) console.log(`  ... and ${todo.length - 20} more`)
    return
  }

  const safeAppendMiss = (song: SongRow, reason: string): void => {
    try {
      appendMiss(song, reason)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`  (failed to append miss for ${song.song_id}: ${msg})`)
    }
  }

  let ok = 0
  let miss = 0
  const newlyOkIds: string[] = []
  const winsBySource = new Map<SourceName, number>()

  for (let i = 0; i < todo.length; i++) {
    const song = todo[i]
    const prefix = `[${i + 1}/${todo.length}] ${song.song_id}`
    const { candidates, errors } = await fetchAllSources(song, sources)
    const winner = pickBest(candidates)

    if (winner) {
      try {
        await upsertLyrics(song.song_id, winner)
        if (winner.source === 'youtube' && winner.youtube_url) {
          await backfillYoutube(song.song_id, winner.youtube_url, winner.duration_seconds)
        }
        ok++
        newlyOkIds.push(song.song_id)
        winsBySource.set(winner.source, (winsBySource.get(winner.source) ?? 0) + 1)
        console.log(`${prefix} ✓ ${winner.source} | ${summariseCandidates(candidates)}`)
      } catch (err) {
        miss++
        const msg = err instanceof Error ? err.message : String(err)
        safeAppendMiss(song, `upsert failed: ${msg}`)
        console.log(`${prefix} ! upsert failed: ${msg}`)
      }
    } else {
      miss++
      const reason = errors.length > 0
        ? `all sources failed: ${errors.map((e) => `${e.source}=${e.message}`).join('; ')}`
        : 'no source matched'
      safeAppendMiss(song, reason)
      console.log(`${prefix} ✗ ${reason}`)
    }

    if (i < todo.length - 1) await sleep(PER_SONG_DELAY_MS)
  }

  pruneMisses(newlyOkIds)

  console.log(`[coke-studio:fetch-lyrics] done — ${ok} fetched, ${miss} missed`)
  if (winsBySource.size > 0) {
    const breakdown = [...winsBySource.entries()].map(([s, n]) => `${s}:${n}`).join(' ')
    console.log(`[coke-studio:fetch-lyrics] wins by source: ${breakdown}`)
  }
  if (miss > 0) console.log(`[coke-studio:fetch-lyrics] misses logged to ${MISSES_CSV}`)
}

main().catch((err) => {
  console.error('[coke-studio:fetch-lyrics] failed:', err)
  process.exit(1)
})
