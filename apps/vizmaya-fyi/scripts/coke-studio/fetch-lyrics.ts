/**
 * Coke Studio lyrics fetcher — Genius API search + page HTML scrape.
 *
 * For every row in coke_studio_songs without a cached lyrics record, search
 * Genius for the song, pick the best hit, scrape the song page for lyrics,
 * upsert into coke_studio_song_lyrics. Songs we can't find are written to
 * vizmaya-data/coke-studio/lyrics-misses.csv for manual triage.
 *
 * Run locally:
 *   pnpm coke-studio:fetch-lyrics
 *   pnpm coke-studio:fetch-lyrics -- --season 1
 *   pnpm coke-studio:fetch-lyrics -- --limit 10 --dry-run
 *   pnpm coke-studio:fetch-lyrics -- --force        # refetch even if cached
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write access
 *   GENIUS_CLIENT_ACCESS_TOKEN                            — see docs/coke-studio-pipeline.md
 *
 * Why HTML scrape and not the API? The Genius API returns song metadata
 * (URL, ID, primary artist) but never the lyrics text itself. The canonical
 * pattern across lyric tooling (e.g. the lyricsgenius Python package) is to
 * fetch the song's web page and parse the `[data-lyrics-container=true]`
 * divs. Tolerated but unofficial; we cache to a service-role-only table so
 * we don't republish.
 *
 * Throttling: 1 req/sec by default — Genius free tier is 1000 req/day, and
 * we don't want to get IP-throttled mid-run.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

// Anchor all paths on this script's location, not process.cwd(), so the
// pipeline works regardless of where the user invokes it from. The script
// lives at apps/vizmaya-fyi/scripts/coke-studio/, so the package root is
// ../../ and the repo root is ../../../../.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR    = resolve(SCRIPT_DIR, '../../')
const REPO_ROOT  = resolve(SCRIPT_DIR, '../../../../')

loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

// ---- config + CLI ---------------------------------------------------------

const GENIUS_API = 'https://api.genius.com'
const REQ_DELAY_MS = 1000
const USER_AGENT = 'vizmaya-coke-studio-fetcher/1.0 (+https://vizmaya.fyi)'

const DATA_DIR = resolve(REPO_ROOT, 'vizmaya-data/coke-studio')
const MISSES_CSV = resolve(DATA_DIR, 'lyrics-misses.csv')

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

// ---- types ----------------------------------------------------------------

interface SongRow {
  song_id: string
  title: string
  season: number
  episode: number | null
  track_in_episode: number
  artists: string | null
  notes: string | null
}

interface GeniusHit {
  id: number
  title: string
  primary_artist_name: string
  url: string
}

interface LyricsResult {
  source: 'genius'
  source_url: string
  source_id: string
  raw_text: string
  script_hint: 'arabic' | 'latin' | 'devanagari' | 'mixed' | null
}

// ---- Genius API + scrape --------------------------------------------------

async function geniusSearch(query: string, token: string): Promise<GeniusHit[]> {
  const url = `${GENIUS_API}/search?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': USER_AGENT,
    },
  })
  if (!res.ok) {
    throw new Error(`Genius search ${res.status} ${res.statusText}: ${query}`)
  }
  const body = (await res.json()) as {
    response: { hits: { result: { id: number; title: string; url: string; primary_artist: { name: string } } }[] }
  }
  return body.response.hits.map((h) => ({
    id: h.result.id,
    title: h.result.title,
    primary_artist_name: h.result.primary_artist.name,
    url: h.result.url,
  }))
}

function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Pick the hit that best matches the song. We prefer hits that mention "coke
// studio" in the URL or title (handles covers that share titles with the
// original), then score by title + artist token overlap.
function pickBestHit(song: SongRow, hits: GeniusHit[]): GeniusHit | null {
  if (hits.length === 0) return null

  const titleTokens = new Set(normaliseForMatch(song.title).split(' ').filter(Boolean))
  const artistTokens = new Set(
    (song.artists ?? '')
      .split(/[|,&]/)
      .flatMap((a) => normaliseForMatch(a).split(' '))
      .filter(Boolean),
  )

  const scored = hits.map((h) => {
    const hitTitleTokens = new Set(normaliseForMatch(h.title).split(' ').filter(Boolean))
    const hitArtistTokens = new Set(normaliseForMatch(h.primary_artist_name).split(' ').filter(Boolean))
    const titleOverlap = [...titleTokens].filter((t) => hitTitleTokens.has(t)).length
    const artistOverlap = [...artistTokens].filter((t) => hitArtistTokens.has(t)).length
    const cokeStudioBonus =
      /coke[\s_-]*studio/i.test(h.url) || /coke[\s_-]*studio/i.test(h.title) ? 5 : 0
    return { hit: h, score: titleOverlap * 2 + artistOverlap + cokeStudioBonus }
  })

  scored.sort((a, b) => b.score - a.score)
  // Require a minimum score: at least one title token overlap.
  if (scored[0].score < 2) return null
  return scored[0].hit
}

// Detect dominant script from the first ~200 chars. Used by the extractor to
// route Urdu/Arabic-script verses through a different prompt.
function detectScript(text: string): LyricsResult['script_hint'] {
  const sample = text.slice(0, 200)
  let arabic = 0
  let latin = 0
  let devanagari = 0
  for (const ch of sample) {
    const cp = ch.codePointAt(0) ?? 0
    if ((cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f)) arabic++
    else if (cp >= 0x0900 && cp <= 0x097f) devanagari++
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) latin++
  }
  const total = arabic + latin + devanagari
  if (total === 0) return null
  const dominant = Math.max(arabic, latin, devanagari)
  if (dominant / total < 0.7) return 'mixed'
  if (dominant === arabic) return 'arabic'
  if (dominant === devanagari) return 'devanagari'
  return 'latin'
}

async function scrapeLyrics(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok) return null
  const html = await res.text()
  const dom = new JSDOM(html)
  const containers = dom.window.document.querySelectorAll('[data-lyrics-container="true"]')
  if (containers.length === 0) return null

  // Replace <br> with newlines so the text reads as verses, not one blob.
  // Genius uses <br> for line breaks within sections and a new container per
  // section (Verse 1, Chorus, etc).
  const sections: string[] = []
  for (const c of containers) {
    for (const br of c.querySelectorAll('br')) {
      br.replaceWith(dom.window.document.createTextNode('\n'))
    }
    const text = (c.textContent ?? '').trim()
    if (text) sections.push(text)
  }
  return sections.join('\n\n').trim() || null
}

async function fetchSongLyrics(
  song: SongRow,
  token: string,
): Promise<LyricsResult | null> {
  const firstArtist = (song.artists ?? '').split(/[|,&]/)[0]?.trim() ?? ''
  const query = `${song.title} ${firstArtist} coke studio`.trim()
  const hits = await geniusSearch(query, token)
  const hit = pickBestHit(song, hits)
  if (!hit) return null
  const text = await scrapeLyrics(hit.url)
  if (!text) return null
  return {
    source: 'genius',
    source_url: hit.url,
    source_id: String(hit.id),
    raw_text: text,
    script_hint: detectScript(text),
  }
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

async function upsertLyrics(songId: string, result: LyricsResult): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('coke_studio_song_lyrics').upsert(
    {
      song_id: songId,
      source: result.source,
      source_url: result.source_url,
      source_id: result.source_id,
      raw_text: result.raw_text,
      script_hint: result.script_hint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'song_id', ignoreDuplicates: false },
  )
  if (error) throw new Error(`upsert coke_studio_song_lyrics ${songId}: ${error.message}`)
}

// ---- misses CSV -----------------------------------------------------------

function appendMiss(song: SongRow, reason: string): void {
  const header = 'song_id,title,season,episode,artists,reason,attempted_at\n'
  if (!existsSync(MISSES_CSV)) {
    // Parent might not exist on a fresh checkout where vizmaya-data is
    // a sibling that wasn't created locally yet.
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

// ---- entry point ----------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const cli = parseCli()
  const token = process.env.GENIUS_CLIENT_ACCESS_TOKEN
  if (!token) {
    throw new Error(
      'GENIUS_CLIENT_ACCESS_TOKEN not set — see apps/vizmaya-fyi/docs/coke-studio-pipeline.md for setup',
    )
  }

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

  // Log misses through this wrapper so a write failure (permissions, disk
  // full, etc) doesn't bubble out and abort the rest of the run.
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
  for (let i = 0; i < todo.length; i++) {
    const song = todo[i]
    const prefix = `[${i + 1}/${todo.length}] ${song.song_id}`
    try {
      const result = await fetchSongLyrics(song, token)
      if (result) {
        await upsertLyrics(song.song_id, result)
        ok++
        newlyOkIds.push(song.song_id)
        console.log(`${prefix} ✓ ${result.script_hint ?? '?'} ${result.raw_text.length}ch`)
      } else {
        miss++
        safeAppendMiss(song, 'no Genius match or empty lyrics page')
        console.log(`${prefix} ✗ no match`)
      }
    } catch (err) {
      miss++
      const msg = err instanceof Error ? err.message : String(err)
      safeAppendMiss(song, msg)
      console.log(`${prefix} ! ${msg}`)
    }
    if (i < todo.length - 1) await sleep(REQ_DELAY_MS)
  }

  // Clear previously-logged misses for songs we just succeeded on, so the
  // misses CSV stays a live to-fix list rather than an append-only audit.
  pruneMisses(newlyOkIds)

  console.log(`[coke-studio:fetch-lyrics] done — ${ok} fetched, ${miss} missed`)
  if (miss > 0) console.log(`[coke-studio:fetch-lyrics] misses logged to ${MISSES_CSV}`)
}

main().catch((err) => {
  console.error('[coke-studio:fetch-lyrics] failed:', err)
  process.exit(1)
})
