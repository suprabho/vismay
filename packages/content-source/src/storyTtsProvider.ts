/**
 * TTS provider seam for story audio generation.
 *
 * `storyAudioGenerate.ts` speaks to exactly one provider per run, selected by
 * `TTS_PROVIDER` (or the `provider` option): the hosted Gemini TTS API or a
 * self-hosted voicebox server (https://github.com/jamiepine/voicebox). This
 * module owns everything provider- and format-specific:
 *
 *   - provider resolution (`resolveTtsProvider`)
 *   - the voicebox HTTP client (`callVoiceboxOnce`, `waitForVoiceboxReady`)
 *   - WAV parsing + normalization (`parseWavHeader`, `normalizeWav`,
 *     `wrapPcmInWav`, `wavDurationMs`)
 *
 * Every stored chunk MUST be a canonical mono / 24 kHz / 16-bit PCM WAV —
 * the video render (`buildCombinedAudio` in apps/vizmaya-fyi) concatenates
 * chunk files with ffmpeg `-c copy`, which is only safe when all chunks share
 * one byte-identical format. Gemini returns raw PCM at exactly that rate;
 * voicebox output is normalized here (re-emitted verbatim when already
 * canonical, resampled through ffmpeg otherwise).
 *
 * Voicebox API (two-step): `POST /generate` {text, profile_id, language}
 * returns JSON with a generation `id`; the audio file is then fetched from
 * `GET /audio/{id}`. `GET /health` reports `model_loaded`. The deployed
 * server sits behind a bearer-token proxy (see infra/voicebox/) — the token
 * rides in `Authorization`; a bare local instance ignores it.
 *
 * NOTE: TTS deliberately does NOT route through @vismay/ai-gateway — the
 * gateway wraps the hosted Vercel AI Gateway, which cannot reach a
 * self-hosted audio server, and its audit model is text/image-shaped.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'

/* ─── Provider resolution ──────────────────────────────────────────── */

export type TtsProviderName = 'voicebox' | 'gemini'

/**
 * Explicit option → `TTS_PROVIDER` env → default `gemini`.
 * (The default flips to `voicebox` at the Phase 3 cutover — see
 * docs/voicebox-tts.md. Until then every environment without a voicebox
 * URL keeps working untouched.)
 */
export function resolveTtsProvider(explicit?: string): TtsProviderName {
  const raw = (explicit ?? process.env.TTS_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'voicebox') return 'voicebox'
  if (raw === '' || raw === 'gemini') return 'gemini'
  throw new Error(`Unknown TTS provider "${raw}" — expected "voicebox" or "gemini".`)
}

/** Shared result shape for a single TTS attempt, across providers. */
export type TtsCallResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; status: number; retryAfterMs?: number; error: string }

/* ─── Canonical WAV format ─────────────────────────────────────────── */

export interface WavFormat {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
}

/** The one format every stored chunk must have (see module comment). */
export const CANONICAL_WAV: WavFormat = {
  numChannels: 1,
  sampleRate: 24000,
  bitsPerSample: 16,
}

export function createWavHeader(dataLength: number, options: WavFormat): Buffer {
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

/** Wrap raw canonical PCM (as Gemini returns it) in a WAV container. */
export function wrapPcmInWav(pcmData: Buffer): Buffer {
  return Buffer.concat([createWavHeader(pcmData.length, CANONICAL_WAV), pcmData])
}

export interface ParsedWavHeader extends WavFormat {
  /** 1 = integer PCM. Anything else needs transcoding. */
  audioFormat: number
  dataOffset: number
  dataLength: number
}

/**
 * Walk a RIFF/WAVE file's chunks to find `fmt ` and `data`. Handles extra
 * chunks (LIST/INFO metadata, `fact`, …) that a fixed 44-byte offset would
 * misread. Returns null when the buffer isn't a parseable WAV.
 */
export function parseWavHeader(buf: Buffer): ParsedWavHeader | null {
  if (buf.length < 12) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return null

  let fmt: Omit<ParsedWavHeader, 'dataOffset' | 'dataLength'> | null = null
  let offset = 12
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    const body = offset + 8

    if (chunkId === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        numChannels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      }
    } else if (chunkId === 'data' && fmt) {
      return {
        ...fmt,
        dataOffset: body,
        // A streamed writer may leave the size field 0/overlong — clamp to
        // what is actually present.
        dataLength: Math.min(chunkSize, buf.length - body) || buf.length - body,
      }
    }

    // Chunks are word-aligned: odd sizes carry a pad byte.
    offset = body + chunkSize + (chunkSize % 2)
  }
  return null
}

/**
 * Duration in ms of a WAV buffer. Parses the real header (works for both
 * Gemini-wrapped and normalized voicebox chunks); falls back to the legacy
 * 44-byte canonical assumption if the header is unparseable.
 */
export function wavDurationMs(wav: Buffer): number {
  const header = parseWavHeader(wav)
  if (header) {
    const byteRate = (header.sampleRate * header.numChannels * header.bitsPerSample) / 8
    if (byteRate > 0) return Math.round((header.dataLength / byteRate) * 1000)
  }
  const pcmBytes = Math.max(0, wav.length - 44)
  return Math.round((pcmBytes / 2 / CANONICAL_WAV.sampleRate) * 1000)
}

function isCanonical(header: ParsedWavHeader): boolean {
  return (
    header.audioFormat === 1 &&
    header.numChannels === CANONICAL_WAV.numChannels &&
    header.sampleRate === CANONICAL_WAV.sampleRate &&
    header.bitsPerSample === CANONICAL_WAV.bitsPerSample
  )
}

/**
 * Normalize any audio buffer to the canonical WAV. Already-canonical input
 * is re-emitted through `createWavHeader` (stripping metadata chunks so all
 * stored chunks are byte-uniform); anything else — other rates, float PCM,
 * even non-WAV containers — is transcoded via ffmpeg (temp files, same
 * pattern as whisper alignment). Requires ffmpeg on PATH only for the
 * transcode path.
 */
export async function normalizeWav(input: Buffer): Promise<Buffer> {
  const header = parseWavHeader(input)
  if (header && isCanonical(header)) {
    const pcm = input.subarray(header.dataOffset, header.dataOffset + header.dataLength)
    return wrapPcmInWav(pcm)
  }

  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // `.bin` in: ffmpeg sniffs the real container, so non-WAV input also works.
  const inPath = path.join(os.tmpdir(), `vismay-tts-in-${tag}.bin`)
  const outPath = path.join(os.tmpdir(), `vismay-tts-out-${tag}.wav`)

  try {
    fs.writeFileSync(inPath, input)

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'ffmpeg',
        [
          '-hide_banner', '-loglevel', 'error',
          '-i', inPath,
          '-ar', String(CANONICAL_WAV.sampleRate),
          '-ac', String(CANONICAL_WAV.numChannels),
          '-c:a', 'pcm_s16le',
          '-fflags', '+bitexact',
          '-y', outPath,
        ],
        { stdio: 'ignore' }
      )
      proc.on('error', (err) =>
        reject(new Error(`ffmpeg not available for WAV normalization: ${err.message}`))
      )
      proc.on('exit', (code) => {
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code} during WAV normalization`))
      })
    })

    const converted = fs.readFileSync(outPath)
    const convertedHeader = parseWavHeader(converted)
    if (!convertedHeader || !isCanonical(convertedHeader)) {
      throw new Error('ffmpeg output is not canonical mono/24kHz/16-bit WAV')
    }
    const pcm = converted.subarray(
      convertedHeader.dataOffset,
      convertedHeader.dataOffset + convertedHeader.dataLength
    )
    return wrapPcmInWav(pcm)
  } finally {
    for (const p of [inPath, outPath]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p) } catch { /* ignore */ }
      }
    }
  }
}

/* ─── Voicebox client ──────────────────────────────────────────────── */

/**
 * Voicebox's documented request cap is 5000 chars; stay under it with margin.
 * A ~250-word chunk is ~1500–1800 chars, so this only trips on oversized
 * CHUNK_WORD_TARGET overrides.
 */
export const VOICEBOX_MAX_TEXT_CHARS = 4800

export interface VoiceboxContext {
  /** Server base URL without trailing slash, e.g. https://vismay-voicebox.fly.dev */
  baseUrl: string
  /** Voice profile id (preset or cloned) from GET /profiles. */
  profileId: string
  /** Bearer token for the auth proxy in front of a deployed server. */
  token?: string
  /** BCP-ish language code passed to /generate (default 'en'). */
  language?: string
  /** Optional generation seed for reproducibility. */
  seed?: number
  /** Per-request timeout — CPU synthesis of a 250-word chunk is slow. */
  timeoutMs: number
}

function voiceboxHeaders(ctx: VoiceboxContext, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`
  return headers
}

/**
 * Single voicebox generation: POST /generate → GET /audio/{id} → normalize.
 * Same result shape as `callGeminiOnce` so the retry layer treats providers
 * uniformly. Network failures (server suspended/unreachable) surface as
 * status 0, which the voicebox retry ladder treats as retryable.
 */
export async function callVoiceboxOnce(
  ctx: VoiceboxContext,
  text: string
): Promise<TtsCallResult> {
  try {
    const genRes = await fetch(`${ctx.baseUrl}/generate`, {
      method: 'POST',
      headers: voiceboxHeaders(ctx, true),
      body: JSON.stringify({
        text,
        profile_id: ctx.profileId,
        language: ctx.language ?? 'en',
        ...(ctx.seed !== undefined ? { seed: ctx.seed } : {}),
      }),
      signal: AbortSignal.timeout(ctx.timeoutMs),
    })

    if (!genRes.ok) {
      const errText = await genRes.text()
      return { ok: false, status: genRes.status, error: errText.slice(0, 200) }
    }

    const gen = (await genRes.json()) as { id?: string }
    if (!gen?.id) {
      return { ok: false, status: 0, error: 'No generation id in /generate response' }
    }

    const audioRes = await fetch(`${ctx.baseUrl}/audio/${gen.id}`, {
      headers: voiceboxHeaders(ctx, false),
      signal: AbortSignal.timeout(ctx.timeoutMs),
    })
    if (!audioRes.ok) {
      const errText = await audioRes.text()
      return {
        ok: false,
        status: audioRes.status,
        error: `audio fetch: ${errText.slice(0, 200)}`,
      }
    }

    const raw = Buffer.from(await audioRes.arrayBuffer())
    return { ok: true, buffer: await normalizeWav(raw) }
  } catch (err) {
    return { ok: false, status: 0, error: String(err) }
  }
}

/**
 * Block until the server reports `model_loaded` (bounded). Called once at
 * the start of a voicebox run so a suspended Fly machine gets its wake +
 * model-load window, and a genuinely down server fails fast with one clear
 * error instead of a retry ladder per chunk. `/health` is unauthenticated
 * by design (the proxy exempts it), so no token is sent — this doubles as
 * a check that the proxy exemption works.
 */
export async function waitForVoiceboxReady(
  ctx: Pick<VoiceboxContext, 'baseUrl'>,
  budgetMs = 180_000
): Promise<void> {
  const deadline = Date.now() + budgetMs
  let lastError = 'no response'
  for (;;) {
    try {
      const res = await fetch(`${ctx.baseUrl}/health`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const health = (await res.json()) as { status?: string; model_loaded?: boolean }
        if (health.model_loaded) return
        lastError = `model not loaded (status: ${health.status ?? 'unknown'})`
      } else {
        lastError = `/health returned ${res.status}`
      }
    } catch (err) {
      lastError = String(err)
    }
    if (Date.now() >= deadline) break
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(
    `Voicebox at ${ctx.baseUrl} not ready after ${Math.round(budgetMs / 1000)}s — ${lastError}`
  )
}
