/**
 * Coke Studio place-mention extractor — Claude Sonnet 4.6 on cached lyrics.
 *
 * For every song with cached lyrics (coke_studio_song_lyrics), ask Claude to
 * pick out the places named in the verses, match them against the current
 * gazetteer, and propose gazetteer rows for any new places.
 *
 * Hybrid gazetteer policy (per the spec):
 *   - Proposed additions with place_type IN ('city','country','province')
 *     AND confidence >= 'medium'  → auto-add (gazetteer-additions.csv)
 *   - Everything else (rare/historical/shrines/rivers, or low confidence)
 *     → queue for human review (gazetteer-suggestions.csv)
 *
 * Mentions referencing a place that ends up queued (i.e. not in the
 * gazetteer when the importer runs) are dropped from place_mentions.csv —
 * the FK on coke_studio_place_mentions.place_canonical would reject them.
 *
 * Outputs (vizmaya-data/coke-studio/):
 *   - place_mentions.csv         — full overwrite each run
 *   - gazetteer-additions.csv    — dedupe-on-append, auto-added rows
 *   - gazetteer-suggestions.csv  — append-only review queue
 *
 * Run locally:
 *   pnpm coke-studio:extract-places
 *   pnpm coke-studio:extract-places -- --season 1
 *   pnpm coke-studio:extract-places -- --limit 5 --dry-run
 *   pnpm coke-studio:extract-places -- --force      # re-extract cached songs
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY                                — see docs/coke-studio-pipeline.md
 *
 * Cost estimate (all 352 songs): ~$10-15 at Sonnet 4.6 pricing, with the
 * system prompt + gazetteer cached. See docs/coke-studio-pipeline.md.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import { parse as parseCsv } from 'csv-parse/sync'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// ---- config + CLI ---------------------------------------------------------

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096
const REQ_DELAY_MS = 300

const DATA_DIR = resolve(process.cwd(), 'vizmaya-data/coke-studio')
const PLACE_MENTIONS_CSV     = resolve(DATA_DIR, 'place_mentions.csv')
const GAZETTEER_CSV          = resolve(DATA_DIR, 'gazetteer.csv')
const GAZETTEER_ADDITIONS    = resolve(DATA_DIR, 'gazetteer-additions.csv')
const GAZETTEER_SUGGESTIONS  = resolve(DATA_DIR, 'gazetteer-suggestions.csv')

const AUTO_ADD_TYPES = new Set(['city', 'country', 'province'])
const AUTO_ADD_MIN_CONFIDENCE: ReadonlySet<Confidence> = new Set(['medium', 'high'])

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

type Confidence = 'low' | 'medium' | 'high'
type ContextType = 'beloved' | 'origin' | 'journey' | 'shrine' | 'imagery' | 'address' | 'other'
type PlaceType =
  | 'city' | 'region' | 'province' | 'country'
  | 'river' | 'mountain' | 'desert' | 'shrine' | 'historical'

interface SongWithLyrics {
  song_id: string
  title: string
  title_native: string | null
  season: number
  episode: number | null
  artists: string | null
  notes: string | null
  raw_text: string
  script_hint: string | null
}

interface GazetteerRow {
  place_canonical: string
  place_type: PlaceType
  modern_country: string | null
  historical_polity: string | null
  lat: number
  lon: number
  aliases: string | null
  notes: string | null
}

interface ExtractedMention {
  place_canonical: string
  place_raw: string
  language_of_mention: string
  lyric_context: string
  lyric_translation: string | null
  context_type: ContextType
  verse_number: number | null
  confidence: Confidence
}

interface GazetteerAddition {
  place_canonical: string
  place_type: PlaceType
  modern_country: string | null
  historical_polity: string | null
  lat: number
  lon: number
  aliases: string | null
  notes: string | null
  confidence: Confidence
}

interface ExtractResult {
  mentions: ExtractedMention[]
  gazetteer_additions: GazetteerAddition[]
}

// ---- DB I/O ---------------------------------------------------------------

async function loadSongs(cli: Cli): Promise<SongWithLyrics[]> {
  const sb = createServiceClient()
  let q = sb
    .from('coke_studio_song_lyrics')
    .select(`
      song_id, raw_text, script_hint,
      song:coke_studio_songs!inner (
        title, title_native, season, episode, artists, notes
      )
    `)
    .order('song_id')
  if (cli.season !== null) q = q.eq('song.season', cli.season)
  if (cli.limit !== null) q = q.limit(cli.limit)
  const { data, error } = await q
  if (error) throw new Error(`load song lyrics: ${error.message}`)

  // Supabase typings render `!inner` joins as an array even when the
  // cardinality is 1:1; cast through unknown and normalise to the inner
  // object whether the runtime payload is an array or a single record.
  type Row = {
    song_id: string
    raw_text: string
    script_hint: string | null
    song:
      | { title: string; title_native: string | null; season: number; episode: number | null; artists: string | null; notes: string | null }
      | { title: string; title_native: string | null; season: number; episode: number | null; artists: string | null; notes: string | null }[]
  }
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const s = Array.isArray(r.song) ? r.song[0] : r.song
    return {
      song_id: r.song_id,
      title: s.title,
      title_native: s.title_native,
      season: s.season,
      episode: s.episode,
      artists: s.artists,
      notes: s.notes,
      raw_text: r.raw_text,
      script_hint: r.script_hint,
    }
  })
}

function loadCurrentGazetteer(): GazetteerRow[] {
  const raw = readFileSync(GAZETTEER_CSV, 'utf8')
  const rows = parseCsv(raw, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[]
  return rows.map((r) => ({
    place_canonical: r.place_canonical,
    place_type: r.place_type as PlaceType,
    modern_country: r.modern_country || null,
    historical_polity: r.historical_polity || null,
    lat: Number(r.lat),
    lon: Number(r.lon),
    aliases: r.aliases || null,
    notes: r.notes || null,
  }))
}

function loadExistingAdditions(): Set<string> {
  if (!existsSync(GAZETTEER_ADDITIONS)) return new Set()
  const raw = readFileSync(GAZETTEER_ADDITIONS, 'utf8')
  const rows = parseCsv(raw, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, string>[]
  return new Set(rows.map((r) => r.place_canonical))
}

async function loadSongsWithMentions(): Promise<Set<string>> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('coke_studio_place_mentions').select('song_id')
  if (error) throw new Error(`load place mentions: ${error.message}`)
  return new Set((data ?? []).map((r: { song_id: string }) => r.song_id))
}

// ---- Anthropic ------------------------------------------------------------

// Tool schema mirrors coke_studio_place_mentions + coke_studio_gazetteer.
// `mentions[].place_canonical` MUST equal an entry from the gazetteer rendered
// in the system prompt or the canonical name of a corresponding
// gazetteer_additions row; the post-processing step joins on it.
const EXTRACT_TOOL = {
  name: 'extract_places',
  description: 'Extract every named place from the lyric verses, matching against the supplied gazetteer where possible.',
  input_schema: {
    type: 'object' as const,
    properties: {
      mentions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            place_canonical:    { type: 'string', description: 'Either an entry in the supplied gazetteer or the canonical name of a new gazetteer_addition row.' },
            place_raw:          { type: 'string', description: 'Exact text from the lyric naming the place, in its original script.' },
            language_of_mention:{ type: 'string', description: 'ISO 639-1 code or language name (urdu, punjabi, sindhi, pashto, persian, english, ...).' },
            lyric_context:      { type: 'string', description: 'The 1-2 lines containing the mention, in original script.' },
            lyric_translation:  { type: 'string', description: 'English translation of lyric_context. Empty string if already English.' },
            context_type:       { type: 'string', enum: ['beloved','origin','journey','shrine','imagery','address','other'] },
            verse_number:       { type: 'integer', description: 'Verse index starting at 1, or 0 if in the chorus/refrain.' },
            confidence:         { type: 'string', enum: ['low','medium','high'] },
          },
          required: ['place_canonical','place_raw','language_of_mention','lyric_context','lyric_translation','context_type','verse_number','confidence'],
        },
      },
      gazetteer_additions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            place_canonical:   { type: 'string' },
            place_type:        { type: 'string', enum: ['city','region','province','country','river','mountain','desert','shrine','historical'] },
            modern_country:    { type: 'string', description: 'ISO 3166-1 alpha-2 or empty.' },
            historical_polity: { type: 'string' },
            lat:               { type: 'number' },
            lon:               { type: 'number' },
            aliases:           { type: 'string', description: 'Pipe-separated; include the native-script form.' },
            notes:             { type: 'string' },
            confidence:        { type: 'string', enum: ['low','medium','high'], description: 'How sure you are about the place_type/lat/lon. Drives the hybrid auto-add policy.' },
          },
          required: ['place_canonical','place_type','lat','lon','confidence'],
        },
      },
    },
    required: ['mentions','gazetteer_additions'],
  },
}

function systemPrompt(gazetteer: GazetteerRow[]): string {
  const list = gazetteer
    .map((g) => `- ${g.place_canonical} (${g.place_type}${g.modern_country ? `, ${g.modern_country}` : ''}${g.historical_polity ? `, ${g.historical_polity}` : ''})`)
    .join('\n')

  return `You extract place mentions from Coke Studio Pakistan song lyrics.

The corpus is multilingual — Urdu (Arabic script), Punjabi (Gurmukhi or Shahmukhi), Sindhi (Arabic), Pashto (Arabic), Saraiki, Balochi, Persian, Arabic loan words, and English. Many songs draw on Sufi qawwali traditions where places carry strong emotional/spiritual valence ("the beloved's city", "the shrine at Bhit").

Your task:

1. Find every distinct place mentioned in the lyrics — cities, countries, regions, shrines, rivers, mountains, historical kingdoms.
2. For each mention, decide which canonical place from the supplied gazetteer it refers to. The gazetteer below is the source of truth.
3. If a mention refers to a place NOT in the gazetteer, add it under gazetteer_additions with proposed coordinates and metadata. Then use that new canonical name in the mention.
4. Capture the lyric line(s) verbatim in the original script as lyric_context, and translate to English in lyric_translation.
5. Classify the context_type:
   - "beloved"   — city/place named as the beloved or the singer's heart's home
   - "origin"    — where a character/community is from
   - "journey"   — passing through, going to, coming from
   - "shrine"    — religious/spiritual reverence (Sufi shrines especially)
   - "imagery"   — used as metaphor or simile ("dry as Cholistan")
   - "address"   — calling out to the place by name ("O Lahore!")
   - "other"     — none of the above
6. Set confidence to:
   - "high"   — place is named explicitly, unambiguous match
   - "medium" — strongly implied (e.g. "the city of saints" → Multan in qawwali convention) or named but with some ambiguity
   - "low"    — speculative inference

Rules:
- ONLY extract places actually present in the lyric text. Do NOT infer places from the artist's bio, song title alone (unless the title also appears in lyrics), or general knowledge.
- A verse refrain that mentions a place repeatedly counts as one mention (use the first occurrence's verse_number).
- Names of people, deities, instruments, body parts, abstract concepts, and book titles are NOT places.
- If no places are mentioned, return empty arrays — don't invent any.

Gazetteer (use these canonical names; add to gazetteer_additions if absent):
${list}

Call the extract_places tool with your result.`
}

interface AnthropicToolResponse {
  type: string
  name?: string
  input?: unknown
}

async function callClaude(
  client: Anthropic,
  song: SongWithLyrics,
  systemText: string,
): Promise<ExtractResult> {
  const userText = [
    `Song: ${song.title}${song.title_native ? ` (${song.title_native})` : ''}`,
    `Season: ${song.season}${song.episode ? ` Episode ${song.episode}` : ''}`,
    `Artists: ${song.artists ?? '(unknown)'}`,
    song.notes ? `Notes: ${song.notes}` : null,
    `Script hint: ${song.script_hint ?? 'unknown'}`,
    '',
    'Lyrics:',
    song.raw_text,
  ].filter(Boolean).join('\n')

  // Prompt caching: the system text + tool schema are identical across the
  // 352 calls, so flag them with cache_control. Cuts billable input tokens
  // on cache hits by ~90%.
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    tools: [{ ...EXTRACT_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: EXTRACT_TOOL.name },
    messages: [{ role: 'user', content: userText }],
  })

  for (const block of response.content as AnthropicToolResponse[]) {
    if (block.type === 'tool_use' && block.name === EXTRACT_TOOL.name) {
      return validateExtractResult(block.input)
    }
  }
  throw new Error('no tool_use block in Claude response')
}

function validateExtractResult(raw: unknown): ExtractResult {
  if (!raw || typeof raw !== 'object') throw new Error('tool input not an object')
  const r = raw as { mentions?: unknown; gazetteer_additions?: unknown }
  const mentions = Array.isArray(r.mentions) ? r.mentions : []
  const additions = Array.isArray(r.gazetteer_additions) ? r.gazetteer_additions : []
  return {
    mentions: mentions.map(validateMention),
    gazetteer_additions: additions.map(validateAddition),
  }
}

function validateMention(raw: unknown): ExtractedMention {
  const m = raw as Record<string, unknown>
  return {
    place_canonical:     String(m.place_canonical ?? ''),
    place_raw:           String(m.place_raw ?? ''),
    language_of_mention: String(m.language_of_mention ?? ''),
    lyric_context:       String(m.lyric_context ?? ''),
    lyric_translation:   m.lyric_translation ? String(m.lyric_translation) : null,
    context_type:        (m.context_type as ContextType) ?? 'other',
    verse_number:        typeof m.verse_number === 'number' && m.verse_number > 0 ? m.verse_number : null,
    confidence:          (m.confidence as Confidence) ?? 'low',
  }
}

function validateAddition(raw: unknown): GazetteerAddition {
  const a = raw as Record<string, unknown>
  return {
    place_canonical:    String(a.place_canonical ?? ''),
    place_type:         (a.place_type as PlaceType) ?? 'historical',
    modern_country:     a.modern_country ? String(a.modern_country).toUpperCase().slice(0, 2) || null : null,
    historical_polity:  a.historical_polity ? String(a.historical_polity) : null,
    lat:                Number(a.lat),
    lon:                Number(a.lon),
    aliases:            a.aliases ? String(a.aliases) : null,
    notes:              a.notes ? String(a.notes) : null,
    confidence:         (a.confidence as Confidence) ?? 'low',
  }
}

// ---- CSV writers ----------------------------------------------------------

function csvCell(v: string | number | null): string {
  if (v == null) return ''
  const s = typeof v === 'number' ? String(v) : v
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeMentionsCsv(allMentions: { song_id: string; index: number; m: ExtractedMention }[]): void {
  const header = 'mention_id,song_id,place_raw,place_canonical,language_of_mention,lyric_context,lyric_translation,context_type,verse_number,confidence,notes\n'
  const rows = allMentions.map(({ song_id, index, m }) => [
    `${song_id}_m${String(index + 1).padStart(2, '0')}`,
    song_id,
    csvCell(m.place_raw),
    csvCell(m.place_canonical),
    csvCell(m.language_of_mention),
    csvCell(m.lyric_context),
    csvCell(m.lyric_translation),
    csvCell(m.context_type),
    csvCell(m.verse_number),
    csvCell(m.confidence),
    '',
  ].join(','))
  writeFileSync(PLACE_MENTIONS_CSV, header + rows.join('\n') + (rows.length ? '\n' : ''))
}

function appendGazetteerRows(path: string, rows: GazetteerAddition[], existingKeys: Set<string>): GazetteerAddition[] {
  const header = 'place_canonical,place_type,modern_country,historical_polity,lat,lon,aliases,notes\n'
  if (!existsSync(path)) writeFileSync(path, header)
  const fresh = rows.filter((r) => !existingKeys.has(r.place_canonical))
  for (const r of fresh) existingKeys.add(r.place_canonical)
  if (fresh.length === 0) return []
  const csvRows = fresh.map((r) => [
    csvCell(r.place_canonical),
    csvCell(r.place_type),
    csvCell(r.modern_country),
    csvCell(r.historical_polity),
    csvCell(r.lat),
    csvCell(r.lon),
    csvCell(r.aliases),
    csvCell(r.notes),
  ].join(',')).join('\n')
  appendFileSync(path, csvRows + '\n')
  return fresh
}

function appendSuggestionsCsv(rows: { addition: GazetteerAddition; reason: string; song_id: string }[]): void {
  const header = 'place_canonical,place_type,modern_country,lat,lon,confidence,first_seen_song,reason,suggested_at\n'
  if (!existsSync(GAZETTEER_SUGGESTIONS)) writeFileSync(GAZETTEER_SUGGESTIONS, header)
  if (rows.length === 0) return
  const csvRows = rows.map(({ addition, reason, song_id }) => [
    csvCell(addition.place_canonical),
    csvCell(addition.place_type),
    csvCell(addition.modern_country),
    csvCell(addition.lat),
    csvCell(addition.lon),
    csvCell(addition.confidence),
    csvCell(song_id),
    csvCell(reason),
    new Date().toISOString(),
  ].join(',')).join('\n')
  appendFileSync(GAZETTEER_SUGGESTIONS, csvRows + '\n')
}

// ---- entry point ----------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const cli = parseCli()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — see apps/vizmaya-fyi/docs/coke-studio-pipeline.md')
  }
  const client = new Anthropic({ apiKey })

  const gazetteer = loadCurrentGazetteer()
  const songs = await loadSongs(cli)
  const alreadyExtracted = cli.force ? new Set<string>() : await loadSongsWithMentions()
  const todo = songs.filter((s) => !alreadyExtracted.has(s.song_id))
  const existingAdditionKeys = loadExistingAdditions()

  console.log(`[coke-studio:extract-places] ${songs.length} songs with lyrics, ${alreadyExtracted.size} already extracted, ${todo.length} to process`)
  console.log(`[coke-studio:extract-places] gazetteer has ${gazetteer.length} entries; ${existingAdditionKeys.size} previously auto-added`)

  if (cli.dryRun) {
    for (const s of todo.slice(0, 10)) {
      console.log(`  would extract: ${s.song_id} | ${s.title} | ${s.raw_text.length}ch | ${s.script_hint ?? '?'}`)
    }
    if (todo.length > 10) console.log(`  ... and ${todo.length - 10} more`)
    return
  }

  const systemText = systemPrompt(gazetteer)
  const gazetteerNames = new Set(gazetteer.map((g) => g.place_canonical))
  const allMentions: { song_id: string; index: number; m: ExtractedMention }[] = []
  const pendingAutoAdds: GazetteerAddition[] = []
  const pendingSuggestions: { addition: GazetteerAddition; reason: string; song_id: string }[] = []

  let totalIn = 0
  let totalOut = 0
  let totalCacheRead = 0

  for (let i = 0; i < todo.length; i++) {
    const song = todo[i]
    const prefix = `[${i + 1}/${todo.length}] ${song.song_id}`
    try {
      const result = await callClaude(client, song, systemText)

      // Partition gazetteer additions into auto-add vs queue using the
      // hybrid policy.
      const autoAdds: GazetteerAddition[] = []
      const queued: GazetteerAddition[] = []
      for (const add of result.gazetteer_additions) {
        const isAutoType = AUTO_ADD_TYPES.has(add.place_type)
        const isConfident = AUTO_ADD_MIN_CONFIDENCE.has(add.confidence)
        const hasCoords = Number.isFinite(add.lat) && Number.isFinite(add.lon)
        if (isAutoType && isConfident && hasCoords) autoAdds.push(add)
        else queued.push(add)
      }
      pendingAutoAdds.push(...autoAdds)
      for (const q of queued) {
        pendingSuggestions.push({
          addition: q,
          reason: !AUTO_ADD_TYPES.has(q.place_type)
            ? `place_type='${q.place_type}' not auto-added`
            : !AUTO_ADD_MIN_CONFIDENCE.has(q.confidence)
              ? `confidence='${q.confidence}' below threshold`
              : 'missing coords',
          song_id: song.song_id,
        })
      }

      // Track which places will exist in the gazetteer after this run
      // (current + auto-adds, but NOT queued). Drop mentions whose canonical
      // ends up queued — the FK on place_mentions would reject them.
      const futureGazetteer = new Set([
        ...gazetteerNames,
        ...existingAdditionKeys,
        ...autoAdds.map((a) => a.place_canonical),
      ])
      const survivingMentions = result.mentions.filter((m) => futureGazetteer.has(m.place_canonical))
      const droppedCount = result.mentions.length - survivingMentions.length

      for (let j = 0; j < survivingMentions.length; j++) {
        allMentions.push({ song_id: song.song_id, index: j, m: survivingMentions[j] })
      }

      console.log(`${prefix} ✓ ${survivingMentions.length} mentions, ${autoAdds.length} auto-adds, ${queued.length} queued${droppedCount ? `, ${droppedCount} dropped (FK)` : ''}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`${prefix} ! ${msg}`)
    }

    // Throttle to keep Anthropic happy under sustained load.
    if (i < todo.length - 1) await sleep(REQ_DELAY_MS)
  }

  // Apply file writes once at the end so a mid-run failure leaves a clean
  // partial state rather than half-written CSVs.
  writeMentionsCsv(allMentions)
  const newlyAdded = appendGazetteerRows(GAZETTEER_ADDITIONS, pendingAutoAdds, existingAdditionKeys)
  appendSuggestionsCsv(pendingSuggestions)

  console.log(`[coke-studio:extract-places] done`)
  console.log(`  ${allMentions.length} mentions written to ${PLACE_MENTIONS_CSV}`)
  console.log(`  ${newlyAdded.length} new gazetteer rows appended to ${GAZETTEER_ADDITIONS}`)
  console.log(`  ${pendingSuggestions.length} suggestions queued in ${GAZETTEER_SUGGESTIONS}`)
  if (totalIn || totalOut || totalCacheRead) {
    console.log(`  tokens: ${totalIn} input, ${totalOut} output, ${totalCacheRead} cache-read`)
  }
  console.log(`  next: pnpm coke-studio:import`)
}

main().catch((err) => {
  console.error('[coke-studio:extract-places] failed:', err)
  process.exit(1)
})
