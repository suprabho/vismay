/**
 * Vismay-level story audio generation.
 *
 * Vertical-agnostic core lifted out of `apps/vizmaya-fyi/scripts/generate-audio.ts`.
 * Any vertical's story — vizmaya, footshorts, vizf1, kidzovo — resolves through
 * the shared content source (`CONTENT_SOURCE=fs|db`), so a footshorts DB row gets
 * audio through the exact same path as a vizmaya markdown file.
 *
 * Reads each story's content + config, resolves mobile units (the same
 * `resolveUnits` the runtime player uses, so `unit_index` cues stay aligned),
 * packs consecutive units into chunks (~250 words of audio each) and makes one
 * TTS call per chunk — not once per unit. The provider is selected via
 * `TTS_PROVIDER` (see ./storyTtsProvider): `gemini` (hosted; chunking keeps
 * daily request volume under its quota) or `voicebox` (self-hosted; no quota,
 * chunking kept for cue alignment). Per-unit playback cues are stored alongside
 * the chunk audio so the autoplay player can drive `activeUnit` from currentTime.
 *
 * The chunk-hash cache key includes `provider:voice`, so switching provider or
 * voice invalidates every chunk — a plain (non-force) run then fully re-voices
 * a story rather than leaving it mixed-voice.
 *
 * Narration text + per-unit overrides + the methodology skip-list all come from
 * `./storyTts` (`defaultNarrationText`, `parseTtsConfig`, `findTtsOverride`,
 * `TTS_SKIP_IDS`) — the single source of truth the admin Narration tab also
 * reads, so the previewed string is byte-for-byte what gets sent to Gemini.
 *
 * Tables written:
 *   - story_audio_chunks (one row per chunk)
 *   - story_audio_cues   (one row per mobile unit, with start_ms/end_ms)
 *
 * Cue timings default to proportional (allocate chunk duration by character
 * count). Set whisper.enabled + whisper.model to run whisper.cpp on each chunk
 * and derive cues from word-level timings instead. Falls back to proportional
 * silently on any whisper failure.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import type { ResolvedUnit } from '@vismay/viz-engine'
import { getContentSource } from './contentSource'
import { createServiceClient } from './supabase'
import { resolveMobileUnits } from './resolveMobileUnits'
import {
  defaultNarrationText,
  parseTtsConfig,
  findTtsOverride,
  TTS_SKIP_IDS,
  type TtsConfig,
} from './storyTts'
import {
  resolveTtsProvider,
  callVoiceboxOnce,
  waitForVoiceboxReady,
  wrapPcmInWav,
  wavDurationMs,
  VOICEBOX_MAX_TEXT_CHARS,
  type TtsProviderName,
  type TtsCallResult,
  type VoiceboxContext,
} from './storyTtsProvider'

type ServiceClient = ReturnType<typeof createServiceClient>

/* ─── Public API ───────────────────────────────────────────────────── */

export interface WhisperOptions {
  enabled: boolean
  /** whisper.cpp binary on PATH (default `whisper-cli`). */
  bin?: string
  /** Path to a ggml model — required when enabled. */
  model?: string
}

export interface GenerateStoryAudioOptions {
  slug: string
  /** Regenerate every chunk even if the transcript hash is unchanged. */
  force?: boolean
  /** TTS provider (default `TTS_PROVIDER` env, falling back to `gemini`). */
  provider?: TtsProviderName
  /** Gemini API key (default `process.env.GEMINI_API_KEY`; gemini only). */
  geminiApiKey?: string
  /** Voicebox server base URL (default `VOICEBOX_URL`; voicebox only). */
  voiceboxUrl?: string
  /** Voicebox voice profile id (default `VOICEBOX_PROFILE_ID`; voicebox only). */
  voiceboxProfileId?: string
  /** Bearer token for the voicebox auth proxy (default `VOICEBOX_TOKEN`). */
  voiceboxToken?: string
  /** Per-request voicebox timeout (default `VOICEBOX_TIMEOUT_MS` or 300000). */
  voiceboxTimeoutMs?: number
  /** Supabase service client (default `createServiceClient()`). */
  supabase?: ServiceClient
  /** Target words per chunk (default `CHUNK_WORD_TARGET` env or 250). */
  chunkWordTarget?: number
  /** Minimum ms between Gemini calls (default `RATE_LIMIT_MS` env or 8000). */
  rateLimitMs?: number
  /** Storage bucket for chunk WAVs (default `story-audio`). */
  bucket?: string
  /** Prebuilt Gemini voice (default `Orus`; gemini only). */
  voiceName?: string
  /** Optional whisper.cpp forced alignment. */
  whisper?: WhisperOptions
}

export interface GenerateStoryAudioResult {
  slug: string
  units: number
  chunks: number
  generated: number
  skipped: number
  failed: number
}

/** Thrown when Gemini returns a multi-minute retry hint (daily quota). */
export class DailyQuotaExhaustedError extends Error {
  constructor() {
    super('DAILY_QUOTA_EXHAUSTED')
    this.name = 'DailyQuotaExhaustedError'
  }
}

/** Resolve every story slug known to the active content source. */
export async function listAudioStorySlugs(): Promise<string[]> {
  const stories = await getContentSource().listStories()
  return stories.map((s) => s.slug)
}

/* ─── Mobile units → narration ─────────────────────────────────────── */

// `resolveMobileUnits` is shared with the silent-video timeline (see
// ./resolveMobileUnits) so both pipelines resolve `unit_index` identically.

/** Units whose section id is in TTS_SKIP_IDS get no audio and no cue. */
function unitSkipped(unit: ResolvedUnit): boolean {
  return TTS_SKIP_IDS.has(unit.parentConfig.id ?? '')
}

/** Narration string for a unit — override wins, else the shared default. */
function unitNarration(unit: ResolvedUnit, ttsConfig: TtsConfig | null): string {
  const override = findTtsOverride(
    ttsConfig,
    unit.parentIndex,
    unit.subIndex,
    unit.sliceIndex ?? 0
  )
  return override ? override.script : defaultNarrationText(unit)
}

/* ─── TTS providers ────────────────────────────────────────────────── */

// WAV parsing/normalization + the voicebox client live in ./storyTtsProvider.
// This file only owns the per-provider retry policy and context wiring.

/**
 * Rate limiter — enforces a minimum interval between Gemini API calls.
 * 8000ms ≈ 7.5 req/min. (Voicebox is self-hosted and needs no limiter.)
 */
function makeRateLimiter(minIntervalMs: number) {
  let lastCallAt = 0
  return async function rateLimit() {
    const now = Date.now()
    const elapsed = now - lastCallAt
    if (elapsed < minIntervalMs) {
      await new Promise((r) => setTimeout(r, minIntervalMs - elapsed))
    }
    lastCallAt = Date.now()
  }
}

interface GeminiContext {
  provider: 'gemini'
  apiKey: string
  voiceName: string
  rateLimit: () => Promise<void>
}

interface VoiceboxTtsContext {
  provider: 'voicebox'
  voicebox: VoiceboxContext
}

type TtsContext = GeminiContext | VoiceboxTtsContext

/**
 * Single Gemini TTS call. Returns the parsed WAV buffer, or an object
 * describing why it failed so the retry layer can decide what to do.
 */
async function callGeminiOnce(ctx: GeminiContext, text: string): Promise<TtsCallResult> {
  await ctx.rateLimit()
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${ctx.apiKey}`,
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
                prebuiltVoiceConfig: { voiceName: ctx.voiceName },
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
 * Generate speech with automatic retry on transient failures.
 *
 * Gemini: retries 429/500/503, honors `Retry-After` hints, and bails with
 * `DailyQuotaExhaustedError` when the hint signals a multi-minute wait.
 * Voicebox: retries network errors (status 0 — server suspended/unreachable),
 * 429 and any 5xx with a short 2/4/8/16s ladder; no quota concept.
 */
async function generateSpeech(ctx: TtsContext, text: string): Promise<Buffer | null> {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result =
      ctx.provider === 'gemini'
        ? await callGeminiOnce(ctx, text)
        : await callVoiceboxOnce(ctx.voicebox, text)
    if (result.ok) return result.buffer

    const retryable =
      ctx.provider === 'gemini'
        ? result.status === 429 || result.status === 500 || result.status === 503
        : result.status === 0 || result.status === 429 || result.status >= 500

    if (!retryable || attempt === MAX_ATTEMPTS) {
      console.error(`  ${ctx.provider} TTS error ${result.status}: ${result.error}`)
      return null
    }

    // If Gemini's hint is longer than 5 minutes, treat it as a daily-quota
    // signal — bail out instead of sleeping overnight inside the script.
    const MAX_INLINE_BACKOFF = 5 * 60 * 1000
    if (ctx.provider === 'gemini' && result.retryAfterMs && result.retryAfterMs > MAX_INLINE_BACKOFF) {
      console.error(
        `\n  ✗ Gemini returned a ${Math.round(result.retryAfterMs / 60_000)}-minute retry delay — likely daily quota exhausted. Stopping.`
      )
      throw new DailyQuotaExhaustedError()
    }

    // Backoff: honor a server hint if present, otherwise exponential —
    // 15/30/60/120s for Gemini's quota windows, 2/4/8/16s for a local server.
    const backoffMs =
      result.retryAfterMs ??
      (ctx.provider === 'gemini'
        ? Math.min(120_000, 15_000 * Math.pow(2, attempt - 1))
        : Math.min(16_000, 2_000 * Math.pow(2, attempt - 1)))
    process.stdout.write(
      `\n  ⚠ ${result.status} — backing off ${Math.round(backoffMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})... `
    )
    await new Promise((r) => setTimeout(r, backoffMs))
  }
  return null
}

/* ─── Supabase ─────────────────────────────────────────────────────── */

/** Fetch existing chunk hashes for a story. */
async function getExistingChunkHashes(
  supabase: ServiceClient,
  slug: string
): Promise<Map<number, string>> {
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
  supabase: ServiceClient,
  bucket: string,
  slug: string,
  chunkIndex: number,
  chunkHash: string,
  wavBuffer: Buffer,
  durationMs: number,
  cues: CueRow[]
): Promise<string | null> {
  const storagePath = `${slug}/chunk-${chunkIndex}.wav`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, wavBuffer, {
      contentType: 'audio/wav',
      upsert: true,
    })

  if (uploadError) {
    console.error(`  Storage upload error: ${uploadError.message}`)
    return null
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath)
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
async function pruneChunks(
  supabase: ServiceClient,
  slug: string,
  keepCount: number
): Promise<void> {
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
async function pruneCues(
  supabase: ServiceClient,
  slug: string,
  keepUnitCount: number
): Promise<void> {
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
 */
interface AudioChunk {
  unitIndices: number[]
  texts: string[]
}

const CHUNK_SEPARATOR = '. '

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * Pack consecutive units into chunks no larger than `wordTarget` words.
 * A unit always lives entirely in one chunk — we never split a unit across
 * a request boundary, since cue timings are derived per-unit. Units flagged
 * skipTts (e.g. methodology) are intentionally absent from both the chunk
 * transcript and the cue table — the autoplay player shows their dot with
 * "no audio". `unit_index` is the flat index into `mobileUnits`, so skipped
 * units leave a gap rather than shifting the indices of later units.
 */
function packUnitsIntoChunks(
  units: ResolvedUnit[],
  ttsConfig: TtsConfig | null,
  wordTarget: number
): AudioChunk[] {
  const chunks: AudioChunk[] = []
  let current: AudioChunk = { unitIndices: [], texts: [] }
  let currentWords = 0

  for (let i = 0; i < units.length; i++) {
    if (unitSkipped(units[i])) continue

    const text = unitNarration(units[i], ttsConfig)
    const words = wordCount(text)

    if (currentWords > 0 && currentWords + words > wordTarget) {
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
function computeProportionalCues(chunk: AudioChunk, durationMs: number): CueRow[] {
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

interface WhisperSegment {
  offsets?: { from?: number; to?: number }
  text?: string
}

/**
 * Run whisper.cpp on a chunk's audio to get word-level timings, then map
 * them onto units by word-index ratio. Returns null on any failure so the
 * caller can fall back to proportional cues.
 */
async function runWhisperAlignment(
  whisper: Required<Pick<WhisperOptions, 'bin' | 'model'>>,
  wavBuffer: Buffer,
  chunk: AudioChunk,
  durationMs: number
): Promise<CueRow[] | null> {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const wavPath = path.join(os.tmpdir(), `vizmaya-tts-${tag}.wav`)
  const outPrefix = path.join(os.tmpdir(), `vizmaya-tts-${tag}`)
  const jsonPath = `${outPrefix}.json`

  try {
    fs.writeFileSync(wavPath, wavBuffer)

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        whisper.bin,
        [
          '-m', whisper.model,
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

/**
 * Generate (or refresh) the audio chunks + cues for a single story.
 *
 * Idempotent: chunks whose transcript hash is unchanged are skipped unless
 * `force` is set. Throws `DailyQuotaExhaustedError` if Gemini signals the
 * daily quota is gone — already-generated rows are left in place so a re-run
 * picks up where it stopped.
 */
export async function generateStoryAudio(
  options: GenerateStoryAudioOptions
): Promise<GenerateStoryAudioResult> {
  const { slug, force = false } = options

  const provider = resolveTtsProvider(options.provider)

  const supabase = options.supabase ?? createServiceClient()
  const bucket = options.bucket ?? 'story-audio'
  const wordTarget = options.chunkWordTarget ?? Number(process.env.CHUNK_WORD_TARGET ?? 250)
  const rateLimitMs = options.rateLimitMs ?? Number(process.env.RATE_LIMIT_MS ?? 8000)
  const voiceName = options.voiceName ?? 'Orus'

  // Whisper is opt-in; when enabled a model path is mandatory.
  const whisper =
    options.whisper?.enabled && options.whisper.model
      ? { bin: options.whisper.bin ?? 'whisper-cli', model: options.whisper.model }
      : null
  if (options.whisper?.enabled && !options.whisper.model) {
    throw new Error('whisper.enabled is set but whisper.model is missing.')
  }

  // Each provider validates only its own credentials, so a voicebox run
  // needs no Gemini key and vice versa.
  let ttsCtx: TtsContext
  if (provider === 'gemini') {
    const apiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set.')
    ttsCtx = { provider, apiKey, voiceName, rateLimit: makeRateLimiter(rateLimitMs) }
  } else {
    const baseUrl = (options.voiceboxUrl ?? process.env.VOICEBOX_URL ?? '').replace(/\/+$/, '')
    const profileId = options.voiceboxProfileId ?? process.env.VOICEBOX_PROFILE_ID
    if (!baseUrl) throw new Error('TTS_PROVIDER=voicebox but VOICEBOX_URL is not set.')
    if (!profileId) throw new Error('TTS_PROVIDER=voicebox but VOICEBOX_PROFILE_ID is not set.')
    ttsCtx = {
      provider,
      voicebox: {
        baseUrl,
        profileId,
        token: options.voiceboxToken ?? process.env.VOICEBOX_TOKEN,
        timeoutMs:
          options.voiceboxTimeoutMs ?? Number(process.env.VOICEBOX_TIMEOUT_MS ?? 300_000),
      },
    }
  }

  // Part of the chunk cache key: changing provider or voice invalidates
  // every chunk so a story is never left half-and-half between voices.
  const voiceKey =
    ttsCtx.provider === 'gemini'
      ? `gemini:${ttsCtx.voiceName}`
      : `voicebox:${ttsCtx.voicebox.profileId}`

  console.log(`\n━━━ ${slug} ━━━`)
  console.log(`  TTS: ${voiceKey}`)

  // Fail fast (and absorb a suspended server's wake + model load) before
  // resolving any content — one clear error instead of a retry ladder per chunk.
  if (ttsCtx.provider === 'voicebox') {
    await waitForVoiceboxReady(ttsCtx.voicebox)
  }

  const units = await resolveMobileUnits(slug)
  if (units.length === 0) {
    console.log('  No units found, skipping.')
    return { slug, units: 0, chunks: 0, generated: 0, skipped: 0, failed: 0 }
  }

  const ttsConfig = parseTtsConfig(await getContentSource().readTtsYaml(slug))
  const chunks = packUnitsIntoChunks(units, ttsConfig, wordTarget)
  const overrideCount = ttsConfig?.units.length ?? 0
  const overrideMsg = overrideCount > 0 ? ` (${overrideCount} script overrides)` : ''
  console.log(
    `  ${units.length} units → ${chunks.length} chunks (target ${wordTarget} words/chunk)${overrideMsg}`
  )

  const existingHashes = await getExistingChunkHashes(supabase, slug)

  let generated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const transcript = chunk.texts.join(CHUNK_SEPARATOR)
    const hash = hashText(`${voiceKey}|${transcript}`)

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

    if (ttsCtx.provider === 'voicebox' && transcript.length > VOICEBOX_MAX_TEXT_CHARS) {
      console.log(
        `  [${i + 1}/${chunks.length}] ✗ transcript is ${transcript.length} chars — over voicebox's ~5000-char request limit. Reduce CHUNK_WORD_TARGET.`
      )
      failed++
      continue
    }

    process.stdout.write(
      `  [${i + 1}/${chunks.length}] generating (${chunk.unitIndices.length} units, ${wordCount(transcript)}w)... `
    )

    const audioBuffer = await generateSpeech(ttsCtx, transcript)
    if (!audioBuffer) {
      console.log('✗ TTS failed')
      failed++
      continue
    }

    const durationMs = wavDurationMs(audioBuffer)
    let cues: CueRow[] | null = null
    let cueSource: 'whisper' | 'proportional' = 'proportional'
    if (whisper) {
      cues = await runWhisperAlignment(whisper, audioBuffer, chunk, durationMs)
      if (cues) cueSource = 'whisper'
    }
    if (!cues) cues = computeProportionalCues(chunk, durationMs)
    const publicUrl = await uploadChunk(
      supabase,
      bucket,
      slug,
      i,
      hash,
      audioBuffer,
      durationMs,
      cues
    )

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
  await pruneChunks(supabase, slug, chunks.length)
  await pruneCues(supabase, slug, units.length)

  console.log(`  Done: ${generated} generated, ${skipped} skipped, ${failed} failed`)
  return { slug, units: units.length, chunks: chunks.length, generated, skipped, failed }
}
