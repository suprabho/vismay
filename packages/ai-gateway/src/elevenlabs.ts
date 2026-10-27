/**
 * ElevenLabs text-to-speech, called directly: the one speech provider not
 * routed through the Vercel AI Gateway, because the gateway doesn't carry
 * ElevenLabs. Plain fetch against the REST API, no SDK, and the same
 * SpeechResult shape as ./speech so callers handle both alike.
 *
 * Asks for raw 16-bit PCM at 24 kHz (`pcm_24000`), the same as Gemini TTS
 * returns, so the existing WAV wrapping and duration code applies unchanged.
 *
 * Env: ELEVENLABS_API_KEY (server only).
 */

import type { SpeechResult } from './speech'

export const ELEVENLABS_API_KEY_ENV = 'ELEVENLABS_API_KEY'
/** Natural, steady long-form narration. `eleven_flash_v2_5` costs half the credits. */
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2'
/** "George": a warm, measured premade narrator voice. */
export const DEFAULT_ELEVENLABS_VOICE = 'JBFqnCBsd6RMkjVDRZzb'

export function hasElevenLabsCredentials(): boolean {
  return !!process.env[ELEVENLABS_API_KEY_ENV]
}

export interface ElevenLabsSpeechOptions {
  text: string
  /** A voice id from the ElevenLabs voice library. Default {@link DEFAULT_ELEVENLABS_VOICE}. */
  voiceId?: string
  /** Default {@link DEFAULT_ELEVENLABS_MODEL}. */
  modelId?: string
  /**
   * The text spoken just before and after this request, when one passage is
   * voiced in pieces: keeps the intonation continuous across the joins.
   * Ignored by eleven_v3, which doesn't support it.
   */
  previousText?: string
  nextText?: string
  /** Default `pcm_24000`. */
  outputFormat?: string
  apiKey?: string
}

/**
 * An ElevenLabs API failure, shaped like the AI SDK's errors (`statusCode`,
 * `responseHeaders`, `responseBody`) so retry code that reads those works
 * for both providers.
 */
export class ElevenLabsError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
    public readonly responseHeaders: Record<string, string>,
  ) {
    super(`ElevenLabs ${statusCode}: ${responseBody.slice(0, 200)}`)
    this.name = 'ElevenLabsError'
  }

  /** Out of characters for the billing period (not worth retrying today). */
  get quotaExceeded(): boolean {
    return /quota_exceeded/i.test(this.responseBody)
  }
}

export async function generateElevenLabsSpeech(opts: ElevenLabsSpeechOptions): Promise<SpeechResult> {
  const apiKey = opts.apiKey ?? process.env[ELEVENLABS_API_KEY_ENV]
  if (!apiKey) throw new Error(`${ELEVENLABS_API_KEY_ENV} is not set`)
  const voiceId = opts.voiceId ?? DEFAULT_ELEVENLABS_VOICE
  const modelId = opts.modelId ?? DEFAULT_ELEVENLABS_MODEL
  const outputFormat = opts.outputFormat ?? 'pcm_24000'
  const stitching = !modelId.startsWith('eleven_v3')

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/*' },
      body: JSON.stringify({
        text: opts.text,
        model_id: modelId,
        ...(stitching && opts.previousText ? { previous_text: opts.previousText } : {}),
        ...(stitching && opts.nextText ? { next_text: opts.nextText } : {}),
      }),
    },
  )
  if (!res.ok) {
    throw new ElevenLabsError(res.status, await res.text().catch(() => ''), Object.fromEntries(res.headers.entries()))
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const pcm = /^pcm_(\d+)$/.exec(outputFormat)
  return {
    bytes,
    mimeType: pcm ? `audio/pcm;rate=${pcm[1]}` : (res.headers.get('content-type') ?? 'audio/mpeg'),
    modelUsed: `elevenlabs/${modelId}`,
  }
}
