/**
 * Coke Studio Pakistan importer — reads the four CSVs in vizmaya-data/coke-studio
 * and upserts into coke_studio_* tables (migration 046).
 *
 *   vizmaya-data/coke-studio/songs.csv             → coke_studio_songs            (352 seed rows)
 *   vizmaya-data/coke-studio/gazetteer.csv         → coke_studio_gazetteer        (33 seed rows)
 *   vizmaya-data/coke-studio/song_languages.csv    → coke_studio_song_languages   (header-only on first apply)
 *   vizmaya-data/coke-studio/place_mentions.csv    → coke_studio_place_mentions   (header-only on first apply)
 *
 * Run locally:  pnpm coke-studio:import
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write access
 *
 * Idempotency (per vizmaya-data/coke-studio/README.md):
 *   songs           on song_id
 *   gazetteer       on place_canonical
 *   song_languages  on (song_id, language)
 *   place_mentions  on mention_id
 *
 * Re-runs only touch rows whose payload changed. Empty cells are written as
 * NULL (or `false` for the two booleans), preserving the "fill via enrichment
 * pass" plan in INGEST_NOTES.md.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseCsv } from 'csv-parse/sync'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

// Paths anchored on this script's location, not process.cwd() — see
// scripts/coke-studio/fetch-lyrics.ts for the same setup.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR    = resolve(SCRIPT_DIR, '../../')
const REPO_ROOT  = resolve(SCRIPT_DIR, '../../../../')

loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

const DATA_DIR = resolve(REPO_ROOT, 'vizmaya-data/coke-studio')
const SONGS_CSV          = resolve(DATA_DIR, 'songs.csv')
const GAZETTEER_CSV           = resolve(DATA_DIR, 'gazetteer.csv')
const GAZETTEER_ADDITIONS_CSV = resolve(DATA_DIR, 'gazetteer-additions.csv')
const SONG_LANGUAGES_CSV      = resolve(DATA_DIR, 'song_languages.csv')
const PLACE_MENTIONS_CSV      = resolve(DATA_DIR, 'place_mentions.csv')

const BATCH_SIZE = 100

// ---- shared helpers -------------------------------------------------------

function readRows(path: string): Record<string, string>[] {
  if (!existsSync(path)) throw new Error(`missing CSV: ${path}`)
  const raw = readFileSync(path, 'utf8')
  return parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as Record<string, string>[]
}

// gazetteer-additions.csv is optional (only written by extract-places.ts).
function readRowsOptional(path: string): Record<string, string>[] {
  if (!existsSync(path)) return []
  return parseCsv(readFileSync(path, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as Record<string, string>[]
}

function nullable(s: string | undefined): string | null {
  if (s == null) return null
  const trimmed = s.trim()
  return trimmed === '' ? null : trimmed
}

function parseInt0(s: string | undefined): number | null {
  const v = nullable(s)
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`not a number: "${s}"`)
  return Math.trunc(n)
}

function parseFloat0(s: string | undefined): number | null {
  const v = nullable(s)
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`not a number: "${s}"`)
  return n
}

function parseBool(s: string | undefined): boolean {
  const v = nullable(s)
  if (v == null) return false
  const lower = v.toLowerCase()
  return lower === 'true' || lower === '1' || lower === 'yes'
}

// ---- row shapes -----------------------------------------------------------

interface SongRow {
  song_id: string
  title: string
  title_native: string | null
  season: number
  episode: number | null
  track_in_episode: number
  release_date: string | null
  duration_seconds: number | null
  artists: string | null
  lyricists: string | null
  composers: string | null
  producer: string | null
  youtube_url: string | null
  is_instrumental: boolean
  is_cover: boolean
  original_artist: string | null
  notes: string | null
}

interface GazetteerRow {
  place_canonical: string
  place_type: string
  modern_country: string | null
  historical_polity: string | null
  lat: number
  lon: number
  aliases: string | null
  notes: string | null
}

interface SongLanguageRow {
  song_id: string
  language: string
  language_family: string | null
  script: string | null
  share_estimate: number | null
  role: string | null
  verse_locations: string | null
  confidence: string
  source: string | null
  notes: string | null
}

interface PlaceMentionRow {
  mention_id: string
  song_id: string
  place_raw: string | null
  place_canonical: string
  language_of_mention: string | null
  lyric_context: string | null
  lyric_translation: string | null
  context_type: string | null
  verse_number: number | null
  confidence: string
  notes: string | null
}

// ---- parsers --------------------------------------------------------------

function parseSongs(): SongRow[] {
  return readRows(SONGS_CSV).map((r): SongRow => {
    const song_id = nullable(r.song_id)
    if (!song_id) throw new Error(`songs.csv: row missing song_id: ${JSON.stringify(r)}`)
    const title = nullable(r.title)
    if (!title) throw new Error(`songs.csv: ${song_id} missing title`)
    const season = parseInt0(r.season)
    if (season == null) throw new Error(`songs.csv: ${song_id} missing season`)
    const track_in_episode = parseInt0(r.track_in_episode)
    if (track_in_episode == null) throw new Error(`songs.csv: ${song_id} missing track_in_episode`)
    return {
      song_id,
      title,
      title_native:     nullable(r.title_native),
      season,
      episode:          parseInt0(r.episode),
      track_in_episode,
      release_date:     nullable(r.release_date),
      duration_seconds: parseInt0(r.duration_seconds),
      artists:          nullable(r.artists),
      lyricists:        nullable(r.lyricists),
      composers:        nullable(r.composers),
      producer:         nullable(r.producer),
      youtube_url:      nullable(r.youtube_url),
      is_instrumental:  parseBool(r.is_instrumental),
      is_cover:         parseBool(r.is_cover),
      original_artist:  nullable(r.original_artist),
      notes:            nullable(r.notes),
    }
  })
}

function parseGazetteer(): GazetteerRow[] {
  // Hand-seeded entries from gazetteer.csv come first; LLM auto-additions
  // from gazetteer-additions.csv (written by extract-places.ts) are merged
  // after, deduped on place_canonical so the seed wins.
  const seedRows = readRows(GAZETTEER_CSV)
  const additionRows = readRowsOptional(GAZETTEER_ADDITIONS_CSV)
  const seen = new Set<string>()
  const out: GazetteerRow[] = []
  for (const r of [...seedRows, ...additionRows]) {
    const place_canonical = nullable(r.place_canonical)
    if (!place_canonical) throw new Error(`gazetteer row missing place_canonical: ${JSON.stringify(r)}`)
    if (seen.has(place_canonical)) continue
    seen.add(place_canonical)
    const place_type = nullable(r.place_type)
    if (!place_type) throw new Error(`gazetteer.csv: ${place_canonical} missing place_type`)
    const lat = parseFloat0(r.lat)
    const lon = parseFloat0(r.lon)
    if (lat == null || lon == null) throw new Error(`gazetteer.csv: ${place_canonical} missing lat/lon`)
    out.push({
      place_canonical,
      place_type,
      modern_country:    nullable(r.modern_country),
      historical_polity: nullable(r.historical_polity),
      lat,
      lon,
      aliases:           nullable(r.aliases),
      notes:             nullable(r.notes),
    })
  }
  return out
}

function parseSongLanguages(): SongLanguageRow[] {
  // Rows with `song_id` but empty `language` are intentional — instrumental
  // tracks have no lyrics and therefore no language. Zahra Sabri's compilation
  // includes them as "Instrumental (no lyrics)" placeholders so the song_id
  // shows up in the source-of-truth CSV; we drop them at import since
  // (song_id, language) is the PK and a NULL language would violate the
  // not-null constraint. Truly-missing rows (empty song_id) still throw.
  const out: SongLanguageRow[] = []
  for (const r of readRows(SONG_LANGUAGES_CSV)) {
    const song_id = nullable(r.song_id)
    const language = nullable(r.language)
    if (!song_id) {
      throw new Error(`song_languages.csv: row missing song_id: ${JSON.stringify(r)}`)
    }
    if (!language) continue // instrumental — skip
    out.push({
      song_id,
      language,
      language_family: nullable(r.language_family),
      script:          nullable(r.script),
      share_estimate:  parseFloat0(r.share_estimate),
      role:            nullable(r.role),
      verse_locations: nullable(r.verse_locations),
      confidence:      nullable(r.confidence) ?? 'medium',
      source:          nullable(r.source),
      notes:           nullable(r.notes),
    })
  }
  return out
}

// `context_type` is constrained by a check constraint to this enum (see
// migration 046). Older extract-places runs sometimes wrote values outside
// it (e.g. "destination") — most map cleanly onto a member of the enum, the
// rest fall through to 'other'. Normalising here keeps the DB clean without
// forcing a schema relaxation every time the LLM invents a synonym.
const ALLOWED_CONTEXT_TYPES = new Set([
  'beloved', 'origin', 'journey', 'shrine', 'imagery', 'address', 'other',
])
const CONTEXT_TYPE_ALIASES: Record<string, string> = {
  destination: 'journey',
  beloved_home: 'beloved',
  homeland: 'origin',
}

function normalizeContextType(raw: string | null): string | null {
  if (!raw) return null
  const aliased = CONTEXT_TYPE_ALIASES[raw] ?? raw
  return ALLOWED_CONTEXT_TYPES.has(aliased) ? aliased : 'other'
}

function parsePlaceMentions(): PlaceMentionRow[] {
  return readRows(PLACE_MENTIONS_CSV).map((r): PlaceMentionRow => {
    const mention_id = nullable(r.mention_id)
    const song_id = nullable(r.song_id)
    const place_canonical = nullable(r.place_canonical)
    if (!mention_id || !song_id || !place_canonical) {
      throw new Error(
        `place_mentions.csv: row missing mention_id/song_id/place_canonical: ${JSON.stringify(r)}`,
      )
    }
    return {
      mention_id,
      song_id,
      place_raw:           nullable(r.place_raw),
      place_canonical,
      language_of_mention: nullable(r.language_of_mention),
      lyric_context:       nullable(r.lyric_context),
      lyric_translation:   nullable(r.lyric_translation),
      context_type:        normalizeContextType(nullable(r.context_type)),
      verse_number:        parseInt0(r.verse_number),
      confidence:          nullable(r.confidence) ?? 'medium',
      notes:               nullable(r.notes),
    }
  })
}

// ---- upserters ------------------------------------------------------------

// One function per table (matches scripts/energy-profile/import-owid.ts).
// Supabase infers the row shape from the table name in its generated types
// when the project is wired up; we keep these untyped from its perspective
// because this importer runs against a database that doesn't ship types here.

async function upsertSongs(rows: SongRow[]): Promise<void> {
  if (rows.length === 0) return
  const sb = createServiceClient()
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await sb
      .from('coke_studio_songs')
      .upsert(batch, { onConflict: 'song_id', ignoreDuplicates: false })
    if (error) throw new Error(`upsert coke_studio_songs: ${error.message}`)
  }
}

async function upsertGazetteer(rows: GazetteerRow[]): Promise<void> {
  if (rows.length === 0) return
  const sb = createServiceClient()
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await sb
      .from('coke_studio_gazetteer')
      .upsert(batch, { onConflict: 'place_canonical', ignoreDuplicates: false })
    if (error) throw new Error(`upsert coke_studio_gazetteer: ${error.message}`)
  }
}

async function upsertSongLanguages(rows: SongLanguageRow[]): Promise<void> {
  if (rows.length === 0) return
  const sb = createServiceClient()
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await sb
      .from('coke_studio_song_languages')
      .upsert(batch, { onConflict: 'song_id,language', ignoreDuplicates: false })
    if (error) throw new Error(`upsert coke_studio_song_languages: ${error.message}`)
  }
}

async function upsertPlaceMentions(rows: PlaceMentionRow[]): Promise<void> {
  if (rows.length === 0) return
  const sb = createServiceClient()
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await sb
      .from('coke_studio_place_mentions')
      .upsert(batch, { onConflict: 'mention_id', ignoreDuplicates: false })
    if (error) throw new Error(`upsert coke_studio_place_mentions: ${error.message}`)
  }
}

// ---- entry point ----------------------------------------------------------

async function main(): Promise<void> {
  const songs         = parseSongs()
  const gazetteer     = parseGazetteer()
  const songLanguages = parseSongLanguages()
  const placeMentions = parsePlaceMentions()

  console.log(`[coke-studio] parsed ${songs.length} songs, ${gazetteer.length} gazetteer rows, ${songLanguages.length} song-language rows, ${placeMentions.length} place mentions`)

  // Songs + gazetteer first so the FKs on song_languages + place_mentions
  // resolve. Songs and gazetteer are independent of each other.
  await upsertSongs(songs)
  console.log(`[coke-studio] upserted ${songs.length} songs`)

  await upsertGazetteer(gazetteer)
  console.log(`[coke-studio] upserted ${gazetteer.length} gazetteer rows`)

  await upsertSongLanguages(songLanguages)
  console.log(`[coke-studio] upserted ${songLanguages.length} song-language rows`)

  await upsertPlaceMentions(placeMentions)
  console.log(`[coke-studio] upserted ${placeMentions.length} place mentions`)
}

main().catch((err) => {
  console.error('[coke-studio] failed:', err)
  process.exit(1)
})
