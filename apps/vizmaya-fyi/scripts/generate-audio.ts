/**
 * Build-time audio generation script.
 *
 * Reads each story's content + config, resolves units, packs consecutive
 * units into chunks (~3 min of audio each) and calls Gemini TTS once per
 * chunk — not once per unit. This keeps daily request volume well under
 * Gemini's quota. Per-unit playback cues are stored alongside the chunk
 * audio so the autoplay player can drive `activeUnit` from currentTime.
 *
 * Tables written:
 *   - story_audio_chunks (one row per chunk)
 *   - story_audio_cues   (one row per mobile unit, with start_ms/end_ms)
 *
 * Cue timings default to proportional (allocate chunk duration by character
 * count). Set USE_WHISPER_ALIGNMENT=1 + WHISPER_MODEL=<path> to run
 * whisper.cpp on each chunk and derive cues from word-level timings instead.
 * Falls back to proportional silently on any whisper failure.
 *
 * Usage:
 *   npx tsx scripts/generate-audio.ts                       # all stories
 *   npx tsx scripts/generate-audio.ts south-korea-gpu-hour  # one story
 *   npx tsx scripts/generate-audio.ts --force               # regenerate all
 *   CHUNK_WORD_TARGET=500 npx tsx scripts/generate-audio.ts # tune chunk size
 *
 * Whisper alignment (optional, requires `brew install whisper-cpp` + a model):
 *   USE_WHISPER_ALIGNMENT=1 \
 *   WHISPER_MODEL=/path/to/ggml-base.en.bin \
 *     npx tsx scripts/generate-audio.ts <slug> --force
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import { createClient } from '@supabase/supabase-js'

// Load .env from project root (simple parser, no dependency needed)
const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

/* ─── Inline content loading ───────────────────────────────────────── */

const ROOT = path.resolve(__dirname, '..')
const STORIES_DIR = path.join(ROOT, 'content/stories')

// When CONTENT_SOURCE=db, story files live in Postgres (see lib/contentSource.ts).
// CI workflows dispatched from the admin portal run on a fresh checkout that
// won't have DB-only stories on disk, so they must set this env var.
const USE_DB_CONTENT = (process.env.CONTENT_SOURCE ?? 'fs').toLowerCase() === 'db'

async function loadMarkdown(slug: string): Promise<string | null> {
  if (USE_DB_CONTENT) {
    const { data, error } = await supabase
      .from('stories').select('markdown').eq('slug', slug).maybeSingle()
    if (error) throw new Error(`loadMarkdown ${slug}: ${error.message}`)
    return data?.markdown ?? null
  }
  const p = path.join(STORIES_DIR, `${slug}.md`)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

async function loadConfigYaml(slug: string): Promise<string | null> {
  if (USE_DB_CONTENT) {
    const { data, error } = await supabase
      .from('stories').select('config_yaml').eq('slug', slug).maybeSingle()
    if (error) throw new Error(`loadConfigYaml ${slug}: ${error.message}`)
    return data?.config_yaml ?? null
  }
  const p = path.join(STORIES_DIR, `${slug}.config.yaml`)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

async function loadTtsYaml(slug: string): Promise<string | null> {
  if (USE_DB_CONTENT) {
    const { data, error } = await supabase
      .from('stories').select('tts_yaml').eq('slug', slug).maybeSingle()
    // Pre-012 deployments don't have the tts_yaml column; treat as null.
    if (error?.message?.includes('tts_yaml')) return null
    if (error) throw new Error(`loadTtsYaml ${slug}: ${error.message}`)
    return (data as { tts_yaml?: string | null } | null)?.tts_yaml ?? null
  }
  const p = path.join(STORIES_DIR, `${slug}.tts.yaml`)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

async function listAllStorySlugs(): Promise<string[]> {
  if (USE_DB_CONTENT) {
    const { data, error } = await supabase.from('stories').select('slug')
    if (error) throw new Error(`listAllStorySlugs: ${error.message}`)
    return (data ?? []).map((r) => r.slug as string)
  }
  return fs
    .readdirSync(STORIES_DIR)
    .filter((f) => f.endsWith('.config.yaml'))
    .map((f) => f.replace('.config.yaml', ''))
}

interface ContentSection {
  heading: string
  level: number
  body: string[]
}

async function getStoryContent(slug: string) {
  const file = await loadMarkdown(slug)
  if (file == null) throw new Error(`story not found: ${slug}`)
  const { data, content } = matter(file)
  const sections: ContentSection[] = []
  let current: ContentSection | null = null
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,3})\s+(.+)$/)
    if (m) {
      if (current) sections.push(current)
      current = { heading: m[2].trim(), level: m[1].length, body: [] }
    } else {
      if (!current) current = { heading: '', level: 0, body: [] }
      current.body.push(line)
    }
  }
  if (current) sections.push(current)
  return { frontmatter: data, sections }
}

function getParagraphs(section: ContentSection): string[] {
  return section.body
    .join('\n')
    .split(/\n\n+/)
    .map((p) => p.trim().replace(/^#{4,6}\s*/, ''))
    .filter((p) => p && !/^-{3,}$/.test(p))
}

function resolveAnchor(sections: ContentSection[], anchor: string): ContentSection | undefined {
  const parts = anchor.split('>').map((s) => s.trim().toLowerCase())
  if (parts.length > 1) {
    let candidates = sections
    for (const part of parts) {
      const stripped = part.replace(/^act\s+[ivxlcdm]+:\s*/i, '')
      const found = candidates.find((s) => s.heading.toLowerCase().includes(stripped))
      if (!found) break
      const idx = sections.indexOf(found)
      candidates = sections.slice(idx)
      if (part === parts[parts.length - 1]) return found
    }
  }
  const last = parts[parts.length - 1].replace(/^act\s+[ivxlcdm]+:\s*/i, '')
  return sections.find((s) => s.heading.toLowerCase().includes(last))
}

function sliceParagraphs(
  all: string[],
  spec: number | [number, number] | undefined
): string[] {
  if (spec === undefined) return all
  if (typeof spec === 'number') return all.slice(spec, spec + 1)
  return all.slice(spec[0], spec[1])
}

interface UnitInfo {
  heading?: string
  paragraphs: string[]
  kind: string
  chart?: string
  /**
   * Hero kind splits into 'title' (heading-only) and 'dek' (dek+byline)
   * mobile units to match the two snap sections rendered on portrait. Other
   * kinds leave this undefined.
   */
  heroPart?: 'title' | 'dek'
  /**
   * Skip TTS for this unit. Methodology and similar reference-only sections
   * are visible in the story page but don't get audio. Cues aren't written
   * for skipped units — autoplay shows their dot with "no audio".
   */
  skipTts?: boolean
  /**
   * Stable mobile-unit identity used to look up per-unit narration overrides
   * in `<slug>.tts.yaml`. Mirrors the shape `resolveUnits` exposes for runtime
   * mobile units, so an override saved from the admin Narration tab attaches
   * to the same unit here.
   */
  parentIndex: number
  subIndex: number
  sliceIndex: number
}

/**
 * Section IDs whose mobile units should not be sent to TTS. Methodology
 * is always the trailing block of a story; spoken narration sounds awkward
 * there and burns Gemini quota for content readers don't typically listen to.
 */
const TTS_SKIP_IDS = new Set(['methodology'])

/**
 * Resolve mobile units — the smallest grain. When a section/subsection has
 * `mobileParagraphs`, expand it into one unit per slice. Audio is generated
 * per mobile unit; the desktop player concatenates these segments back-to-back.
 */
interface YamlSubsection {
  text?: string
  heading?: string
  paragraphs?: number | [number, number]
  mobileParagraphs?: Array<number | [number, number]>
}
interface YamlSection {
  kind?: string
  id?: string
  chart?: string
  text?: string
  heading?: string
  paragraphs?: number | [number, number]
  mobileParagraphs?: Array<number | [number, number]>
  subsections?: YamlSubsection[]
}

async function resolveMobileUnitsFlat(slug: string): Promise<UnitInfo[]> {
  const { sections } = await getStoryContent(slug)
  const configYaml = await loadConfigYaml(slug)
  if (configYaml == null) return []
  const config = parseYaml(configYaml) as { sections: YamlSection[] }
  const units: UnitInfo[] = []

  config.sections.forEach((section, parentIndex) => {
    const kind = section.kind ?? 'text'
    const skipTts = TTS_SKIP_IDS.has(section.id ?? '')
    const subs = section.subsections
    if (subs && subs.length > 0) {
      subs.forEach((sub, subIndex) => {
        const md = sub.text ? resolveAnchor(sections, sub.text) : undefined
        const allP = md ? getParagraphs(md) : []
        const heading = sub.heading ?? md?.heading

        if (sub.mobileParagraphs) {
          sub.mobileParagraphs.forEach((mobileSpec, sliceIdx) => {
            units.push({
              heading: sliceIdx === 0 ? heading : undefined,
              paragraphs: sliceParagraphs(allP, mobileSpec),
              kind,
              chart: section.chart,
              skipTts,
              parentIndex,
              subIndex,
              sliceIndex: sliceIdx,
            })
          })
        } else {
          units.push({
            heading,
            paragraphs: sliceParagraphs(allP, sub.paragraphs),
            kind,
            chart: section.chart,
            skipTts,
            parentIndex,
            subIndex,
            sliceIndex: 0,
          })
        }
      })
    } else if (section.text) {
      const md = resolveAnchor(sections, section.text)
      const allP = md ? getParagraphs(md) : []
      const heading = section.heading ?? md?.heading

      if (kind === 'hero') {
        // Hero splits into two mobile units to match the two portrait snap
        // sections: title-only, then dek+byline. Each gets its own cue.
        units.push({
          heading,
          paragraphs: [],
          kind,
          chart: section.chart,
          heroPart: 'title',
          skipTts,
          parentIndex,
          subIndex: 0,
          sliceIndex: 0,
        })
        units.push({
          heading: undefined,
          paragraphs: sliceParagraphs(allP, section.paragraphs),
          kind,
          chart: section.chart,
          heroPart: 'dek',
          skipTts,
          parentIndex,
          subIndex: 0,
          sliceIndex: 1,
        })
      } else if (section.mobileParagraphs) {
        section.mobileParagraphs.forEach((mobileSpec: number | [number, number], sliceIdx: number) => {
          units.push({
            heading: sliceIdx === 0 ? heading : undefined,
            paragraphs: sliceParagraphs(allP, mobileSpec),
            kind,
            chart: section.chart,
            skipTts,
            parentIndex,
            subIndex: 0,
            sliceIndex: sliceIdx,
          })
        })
      } else {
        units.push({
          heading,
          paragraphs: sliceParagraphs(allP, section.paragraphs),
          kind,
          chart: section.chart,
          skipTts,
          parentIndex,
          subIndex: 0,
          sliceIndex: 0,
        })
      }
    }
  })

  return units
}

/* ─── TTS overrides ────────────────────────────────────────────────── */

/**
 * Read `<slug>.tts.yaml` for per-unit narration overrides. Returns a Map
 * keyed by `${parentIndex}.${subIndex}.${sliceIndex}`. The schema mirrors
 * `lib/storyTts.ts` (re-implemented here so the script stays free of Next/TS
 * path-alias imports — the bundle is `npx tsx`-only).
 */
async function loadTtsOverrides(slug: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ttsYaml = await loadTtsYaml(slug)
  if (ttsYaml == null) return out
  let doc: unknown
  try {
    doc = parseYaml(ttsYaml)
  } catch {
    return out
  }
  if (!doc || typeof doc !== 'object') return out
  const unitsRaw = (doc as { units?: unknown }).units
  if (!Array.isArray(unitsRaw)) return out
  for (const entry of unitsRaw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const u = e.unit as { parentIndex?: unknown; subIndex?: unknown; sliceIndex?: unknown } | undefined
    const script = e.script
    if (
      !u ||
      typeof u.parentIndex !== 'number' ||
      typeof u.subIndex !== 'number' ||
      typeof script !== 'string' ||
      !script.trim()
    ) {
      continue
    }
    const sliceIndex = typeof u.sliceIndex === 'number' ? u.sliceIndex : 0
    out.set(`${u.parentIndex}.${u.subIndex}.${sliceIndex}`, script)
  }
  return out
}

/* ─── Text extraction ──────────────────────────────────────────────── */

function unitToNarrationText(unit: UnitInfo): string {
  const parts: string[] = []
  if (unit.heading) parts.push(unit.heading)

  if (unit.kind === 'hero') {
    const dek = unit.paragraphs.find((p) => /^\*[^*]/.test(p))?.replace(/^\*+|\*+$/g, '').trim()
    const byline = unit.paragraphs.find((p) => p.startsWith('**'))?.replace(/^\*+|\*+$/g, '').trim()
    if (dek) parts.push(dek)
    if (byline) parts.push(byline)
  } else if (unit.kind === 'stat') {
    parts.push(unit.paragraphs.join(' '))
  } else {
    const cleaned = unit.paragraphs.map((p) =>
      p.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
    )
    parts.push(...cleaned)
  }

  return parts.filter(Boolean).join('. ')
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/* ─── WAV conversion ───────────────────────────────────────────────── */

interface WavConversionOptions {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
}

function createWavHeader(dataLength: number, options: WavConversionOptions): Buffer {
  const { numChannels, sampleRate, bitsPerSample } = options
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const buffer = Buffer.alloc(44)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)

  return buffer
}

function wrapPcmInWav(pcmData: Buffer): Buffer {
  const header = createWavHeader(pcmData.length, {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16,
  })
  return Buffer.concat([header, pcmData])
}

/**
 * Duration in ms of a WAV produced by `wrapPcmInWav` (mono / 24kHz / 16-bit).
 * Reads the standard 44-byte header off the front and divides by the byte rate.
 */
function wavDurationMs(wav: Buffer): number {
  const pcmBytes = Math.max(0, wav.length - 44)
  const samples = pcmBytes / 2
  return Math.round((samples / 24000) * 1000)
}

/* ─── Gemini TTS ───────────────────────────────────────────────────── */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY not set in environment.')
  process.exit(1)
}

/**
 * Rate limiter — enforces a minimum interval between Gemini API calls.
 * 8000ms ≈ 7.5 req/min. Override with RATE_LIMIT_MS env var if needed.
 */
const MIN_INTERVAL_MS = Number(process.env.RATE_LIMIT_MS ?? 8000)
let lastCallAt = 0

async function rateLimit() {
  const now = Date.now()
  const elapsed = now - lastCallAt
  if (elapsed < MIN_INTERVAL_MS) {
    const waitMs = MIN_INTERVAL_MS - elapsed
    await new Promise((r) => setTimeout(r, waitMs))
  }
  lastCallAt = Date.now()
}

/**
 * Single Gemini TTS call. Returns the parsed WAV buffer, or an object
 * describing why it failed so the retry layer can decide what to do.
 */
async function callGeminiOnce(
  text: string
): Promise<
  | { ok: true; buffer: Buffer }
  | { ok: false; status: number; retryAfterMs?: number; error: string }
> {
  await rateLimit()
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            temperature: 1.5,
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Orus' },
              },
            },
          },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      // Try to parse a Retry-After hint from the response body
      let retryAfterMs: number | undefined
      try {
        const errJson = JSON.parse(errText)
        const details = errJson?.error?.details ?? []
        for (const d of details) {
          if (d['@type']?.includes('RetryInfo') && typeof d.retryDelay === 'string') {
            const m = d.retryDelay.match(/^([\d.]+)s$/)
            if (m) retryAfterMs = Math.ceil(parseFloat(m[1]) * 1000)
          }
        }
      } catch {
        // body wasn't JSON
      }
      return { ok: false, status: res.status, retryAfterMs, error: errText.slice(0, 200) }
    }

    const data = await res.json()
    const audioPart = data?.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { mimeType?: string } }) =>
        p.inlineData?.mimeType?.startsWith('audio/')
    )

    if (!audioPart?.inlineData?.data) {
      return { ok: false, status: 0, error: 'No audio in response' }
    }

    const rawPcm = Buffer.from(audioPart.inlineData.data, 'base64')
    return { ok: true, buffer: wrapPcmInWav(rawPcm) }
  } catch (err) {
    return { ok: false, status: 0, error: String(err) }
  }
}

/**
 * Generate speech with automatic retry on rate-limit (429) and transient
 * server errors (500/503). Honors `Retry-After` hints from Gemini when present.
 */
async function generateSpeech(text: string): Promise<Buffer | null> {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callGeminiOnce(text)
    if (result.ok) return result.buffer

    const retryable = result.status === 429 || result.status === 500 || result.status === 503

    if (!retryable || attempt === MAX_ATTEMPTS) {
      console.error(`  Gemini API error ${result.status}: ${result.error}`)
      return null
    }

    // If Gemini's hint is longer than 5 minutes, treat it as a daily-quota
    // signal — bail out instead of sleeping overnight inside the script.
    const MAX_INLINE_BACKOFF = 5 * 60 * 1000
    if (result.retryAfterMs && result.retryAfterMs > MAX_INLINE_BACKOFF) {
      console.error(
        `\n  ✗ Gemini returned a ${Math.round(result.retryAfterMs / 60_000)}-minute retry delay — likely daily quota exhausted. Stopping.`
      )
      throw new Error('DAILY_QUOTA_EXHAUSTED')
    }

    // Backoff: honor server hint if present, otherwise exponential (15s, 30s, 60s, 120s).
    const backoffMs =
      result.retryAfterMs ?? Math.min(120_000, 15_000 * Math.pow(2, attempt - 1))
    process.stdout.write(
      `\n  ⚠ ${result.status} — backing off ${Math.round(backoffMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})... `
    )
    await new Promise((r) => setTimeout(r, backoffMs))
  }
  return null
}

/* ─── Supabase ─────────────────────────────────────────────────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const BUCKET = 'story-audio'

/** Fetch existing chunk hashes for a story. */
async function getExistingChunkHashes(slug: string): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from('story_audio_chunks')
    .select('chunk_index, chunk_hash')
    .eq('slug', slug)

  if (error) {
    console.error('  DB query error:', error.message)
    return new Map()
  }

  const map = new Map<number, string>()
  for (const row of data ?? []) {
    map.set(row.chunk_index, row.chunk_hash)
  }
  return map
}

interface CueRow {
  unit_index: number
  start_ms: number
  end_ms: number
}

/**
 * Upload a chunk's WAV, upsert the chunk row, then replace its cue rows.
 * Cues are deleted+inserted (rather than upserted) so removing a unit from
 * a chunk's text doesn't leave a stale cue behind.
 */
async function uploadChunk(
  slug: string,
  chunkIndex: number,
  chunkHash: string,
  wavBuffer: Buffer,
  durationMs: number,
  cues: CueRow[]
): Promise<string | null> {
  const storagePath = `${slug}/chunk-${chunkIndex}.wav`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, wavBuffer, {
      contentType: 'audio/wav',
      upsert: true,
    })

  if (uploadError) {
    console.error(`  Storage upload error: ${uploadError.message}`)
    return null
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  const { error: chunkErr } = await supabase
    .from('story_audio_chunks')
    .upsert(
      {
        slug,
        chunk_index: chunkIndex,
        chunk_hash: chunkHash,
        storage_path: storagePath,
        public_url: publicUrl,
        duration_ms: durationMs,
      },
      { onConflict: 'slug,chunk_index' }
    )

  if (chunkErr) {
    console.error(`  DB upsert error (chunk): ${chunkErr.message}`)
    return null
  }

  // Replace cue rows for the units this chunk covers
  const unitIndices = cues.map((c) => c.unit_index)
  if (unitIndices.length > 0) {
    const { error: delErr } = await supabase
      .from('story_audio_cues')
      .delete()
      .eq('slug', slug)
      .in('unit_index', unitIndices)
    if (delErr) {
      console.error(`  DB delete error (cues): ${delErr.message}`)
      return null
    }
  }

  if (cues.length > 0) {
    const { error: insErr } = await supabase.from('story_audio_cues').insert(
      cues.map((c) => ({
        slug,
        unit_index: c.unit_index,
        chunk_index: chunkIndex,
        start_ms: c.start_ms,
        end_ms: c.end_ms,
      }))
    )
    if (insErr) {
      console.error(`  DB insert error (cues): ${insErr.message}`)
      return null
    }
  }

  return publicUrl
}

/**
 * Trim chunk rows whose index is >= keepCount. Lets a story shrink (e.g.
 * after editing the markdown) without leaving orphan rows pointing at WAVs
 * that no longer correspond to anything in the source.
 */
async function pruneChunks(slug: string, keepCount: number): Promise<void> {
  const { error } = await supabase
    .from('story_audio_chunks')
    .delete()
    .eq('slug', slug)
    .gte('chunk_index', keepCount)
  if (error) console.error(`  DB prune error (chunks): ${error.message}`)
}

/**
 * Drop cue rows whose unit_index is past the end of the resolved unit list.
 * Mirrors `pruneChunks` for the cue table.
 */
async function pruneCues(slug: string, keepUnitCount: number): Promise<void> {
  const { error } = await supabase
    .from('story_audio_cues')
    .delete()
    .eq('slug', slug)
    .gte('unit_index', keepUnitCount)
  if (error) console.error(`  DB prune error (cues): ${error.message}`)
}

/* ─── Chunk packing ────────────────────────────────────────────────── */

/**
 * One TTS request's worth of units. `texts[i]` is the narration string for
 * `unitIndices[i]`; the prompt sent to Gemini is `texts.join(SEPARATOR)`.
 *
 * Cue offsets fall out of `texts.length` ratios at upload time — we only
 * need to remember the per-unit narration here.
 */
interface AudioChunk {
  unitIndices: number[]
  texts: string[]
}

const CHUNK_SEPARATOR = '. '
/**
 * Target words per chunk. Smaller chunks → more stable Gemini output and
 * tighter whisper alignment (drift accumulates over long audio). At ~180
 * wpm, 250 words ≈ 80–90s per chunk, which empirically produces cleaner
 * audio than longer requests. Override via env if a story has unusual
 * pacing or you're hitting Gemini's daily request quota.
 */
const CHUNK_WORD_TARGET = Number(process.env.CHUNK_WORD_TARGET ?? 250)

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Pack consecutive units into chunks no larger than CHUNK_WORD_TARGET words.
 * A unit always lives entirely in one chunk — we never split a unit across
 * a request boundary, since cue timings are derived per-unit. Units with
 * empty/very-short narration text are still included so they get a (zero-
 * duration) cue and remain addressable from the player.
 */
function packUnitsIntoChunks(
  units: UnitInfo[],
  overrides: Map<string, string>
): AudioChunk[] {
  const chunks: AudioChunk[] = []
  let current: AudioChunk = { unitIndices: [], texts: [] }
  let currentWords = 0

  for (let i = 0; i < units.length; i++) {
    // Units flagged skipTts (e.g. methodology) are intentionally absent from
    // both the chunk transcript and the cue table. The autoplay player shows
    // their dot with "no audio" — viewers can scroll past them silently.
    if (units[i].skipTts) continue

    const u = units[i]
    const override = overrides.get(`${u.parentIndex}.${u.subIndex}.${u.sliceIndex}`)
    const text = override ?? unitToNarrationText(u)
    const words = wordCount(text)

    if (currentWords > 0 && currentWords + words > CHUNK_WORD_TARGET) {
      chunks.push(current)
      current = { unitIndices: [], texts: [] }
      currentWords = 0
    }

    current.unitIndices.push(i)
    current.texts.push(text)
    currentWords += words
  }

  if (current.unitIndices.length > 0) chunks.push(current)
  return chunks
}

/**
 * Allocate a chunk's audio duration to its units in proportion to each
 * unit's narration length (characters). Exact only if Gemini speaks at a
 * uniform rate — close enough for animation cues over a 2–4 unit chunk,
 * and replaceable later with forced alignment.
 */
function computeProportionalCues(
  chunk: AudioChunk,
  durationMs: number
): CueRow[] {
  const lengths = chunk.texts.map((t) => Math.max(1, t.length))
  const total = lengths.reduce((a, b) => a + b, 0)
  let cursor = 0
  const cues: CueRow[] = []
  for (let i = 0; i < chunk.unitIndices.length; i++) {
    const startMs = Math.round((cursor / total) * durationMs)
    cursor += lengths[i]
    const endMs =
      i === chunk.unitIndices.length - 1
        ? durationMs
        : Math.round((cursor / total) * durationMs)
    cues.push({ unit_index: chunk.unitIndices[i], start_ms: startMs, end_ms: endMs })
  }
  return cues
}

/* ─── Whisper forced alignment (optional) ──────────────────────────── */

const USE_WHISPER = process.env.USE_WHISPER_ALIGNMENT === '1'
const WHISPER_BIN = process.env.WHISPER_BIN ?? 'whisper-cli'
const WHISPER_MODEL = process.env.WHISPER_MODEL

interface WhisperSegment {
  offsets?: { from?: number; to?: number }
  text?: string
}

/**
 * Run whisper.cpp on a chunk's audio to get word-level timings, then map
 * them onto units by word-index ratio. Returns null on any failure so the
 * caller can fall back to proportional cues.
 *
 * Word-index ratio (vs. char-aware alignment) is intentionally simple: we
 * trust input/whisper word counts to be within ~10% of each other, and
 * whisper's per-word timings already reflect speech rate and pauses, which
 * is the main thing the proportional method gets wrong.
 */
async function runWhisperAlignment(
  wavBuffer: Buffer,
  chunk: AudioChunk,
  durationMs: number
): Promise<CueRow[] | null> {
  if (!WHISPER_MODEL) {
    console.error('  whisper: WHISPER_MODEL not set')
    return null
  }

  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const wavPath = path.join(os.tmpdir(), `vizmaya-tts-${tag}.wav`)
  const outPrefix = path.join(os.tmpdir(), `vizmaya-tts-${tag}`)
  const jsonPath = `${outPrefix}.json`

  try {
    fs.writeFileSync(wavPath, wavBuffer)

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        WHISPER_BIN,
        [
          '-m', WHISPER_MODEL,
          '-f', wavPath,
          '-oj',           // output JSON
          '-ml', '1',      // max segment length 1 → one word per entry
          '-nt',           // no inline timestamps in printed text
          '-of', outPrefix,
        ],
        { stdio: 'ignore' }
      )
      proc.on('error', reject)
      proc.on('exit', (code) => {
        code === 0 ? resolve() : reject(new Error(`whisper exit ${code}`))
      })
    })

    if (!fs.existsSync(jsonPath)) {
      console.error('  whisper: no JSON output')
      return null
    }

    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      transcription?: WhisperSegment[]
    }

    const words = (parsed.transcription ?? []).filter(
      (s) => (s.text ?? '').trim().length > 0 && s.offsets
    )
    if (words.length === 0) {
      console.error('  whisper: 0 words transcribed')
      return null
    }

    const unitWords = chunk.texts.map(wordCount)
    const totalInputWords = unitWords.reduce((a, b) => a + b, 0)
    if (totalInputWords === 0) return null

    const clamp = (ms: number) => Math.max(0, Math.min(durationMs, ms))
    const wordStart = (idx: number) =>
      clamp(words[Math.min(idx, words.length - 1)]?.offsets?.from ?? 0)
    const wordEnd = (idx: number) =>
      clamp(words[Math.max(0, Math.min(idx, words.length - 1))]?.offsets?.to ?? durationMs)

    const cues: CueRow[] = []
    let cumIn = 0
    for (let i = 0; i < chunk.unitIndices.length; i++) {
      const startWordIdx = Math.floor((cumIn / totalInputWords) * words.length)
      cumIn += unitWords[i]
      const isLast = i === chunk.unitIndices.length - 1
      const endWordIdx = isLast
        ? words.length - 1
        : Math.max(startWordIdx, Math.floor((cumIn / totalInputWords) * words.length) - 1)

      const startMs = wordStart(startWordIdx)
      const endMs = isLast ? durationMs : Math.max(startMs, wordEnd(endWordIdx))
      cues.push({
        unit_index: chunk.unitIndices[i],
        start_ms: startMs,
        end_ms: endMs,
      })
    }
    return cues
  } catch (err) {
    console.error(
      '  whisper alignment failed:',
      err instanceof Error ? err.message : String(err)
    )
    return null
  } finally {
    for (const p of [wavPath, jsonPath]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p) } catch { /* ignore */ }
      }
    }
  }
}

/* ─── Main ─────────────────────────────────────────────────────────── */

async function processStory(slug: string, force: boolean) {
  console.log(`\n━━━ ${slug} ━━━`)

  const units = await resolveMobileUnitsFlat(slug)
  if (units.length === 0) {
    console.log('  No units found, skipping.')
    return
  }

  const overrides = await loadTtsOverrides(slug)
  const chunks = packUnitsIntoChunks(units, overrides)
  const overrideMsg = overrides.size > 0 ? ` (${overrides.size} script overrides)` : ''
  console.log(
    `  ${units.length} units → ${chunks.length} chunks (target ${CHUNK_WORD_TARGET} words/chunk)${overrideMsg}`
  )

  const existingHashes = await getExistingChunkHashes(slug)

  let generated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const transcript = chunk.texts.join(CHUNK_SEPARATOR)
    const hash = hashText(transcript)

    if (!force && existingHashes.get(i) === hash) {
      console.log(
        `  [${i + 1}/${chunks.length}] ✓ unchanged (${chunk.unitIndices.length} units, ${wordCount(transcript)}w), skipping`
      )
      skipped++
      continue
    }

    if (transcript.trim().length < 5) {
      console.log(`  [${i + 1}/${chunks.length}] ⊘ transcript too short, skipping`)
      skipped++
      continue
    }

    process.stdout.write(
      `  [${i + 1}/${chunks.length}] generating (${chunk.unitIndices.length} units, ${wordCount(transcript)}w)... `
    )

    const audioBuffer = await generateSpeech(transcript)
    if (!audioBuffer) {
      console.log('✗ TTS failed')
      failed++
      continue
    }

    const durationMs = wavDurationMs(audioBuffer)
    let cues: CueRow[] | null = null
    let cueSource: 'whisper' | 'proportional' = 'proportional'
    if (USE_WHISPER) {
      cues = await runWhisperAlignment(audioBuffer, chunk, durationMs)
      if (cues) cueSource = 'whisper'
    }
    if (!cues) cues = computeProportionalCues(chunk, durationMs)
    const publicUrl = await uploadChunk(slug, i, hash, audioBuffer, durationMs, cues)

    if (publicUrl) {
      console.log(
        `✓ ${(audioBuffer.length / 1024).toFixed(0)}KB / ${(durationMs / 1000).toFixed(1)}s [${cueSource}] → Supabase`
      )
      generated++
    } else {
      console.log('✗ upload failed')
      failed++
    }
  }

  // Drop any rows from a previous run that no longer correspond to chunks
  // or units in the current source.
  await pruneChunks(slug, chunks.length)
  await pruneCues(slug, units.length)

  console.log(`  Done: ${generated} generated, ${skipped} skipped, ${failed} failed`)
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const slugs = args.filter((a) => !a.startsWith('--'))

  const storySlugs = slugs.length > 0 ? slugs : await listAllStorySlugs()

  console.log(`Audio generation for: ${storySlugs.join(', ')}`)
  if (force) console.log('(--force: regenerating all)')
  if (USE_WHISPER) {
    if (!WHISPER_MODEL) {
      console.error('USE_WHISPER_ALIGNMENT=1 but WHISPER_MODEL is not set. Aborting.')
      process.exit(1)
    }
    console.log(`(whisper alignment ON: ${WHISPER_BIN}, model=${path.basename(WHISPER_MODEL)})`)
  }

  try {
    for (const slug of storySlugs) {
      await processStory(slug, force)
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'DAILY_QUOTA_EXHAUSTED') {
      console.error('Re-run tomorrow once the quota resets — already-generated rows will be skipped.')
      process.exit(2)
    }
    throw err
  }

  console.log('\nAll done.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
