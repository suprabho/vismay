import { generateSpeech as aiGenerateSpeech } from 'ai'
import { getGatewayClient } from './client'
import { resolveModel, type SpeechModelAlias } from './models'

export interface GenerateSpeechOptions {
  /** Alias from MODELS.speech or a raw gateway id. Default `speech.default`. */
  model?: SpeechModelAlias | string
  /** Text to speak. */
  text: string
  /** Provider voice name (Gemini prebuilt voices: `Orus`, `Kore`, …). */
  voice?: string
  /** Desired container, e.g. `wav` or `mp3`. Provider support varies. */
  outputFormat?: string
  /** Style direction, e.g. "Read in a calm, documentary register." */
  instructions?: string
  /**
   * Provider-specific body options, keyed by provider (`{ google: { … } }`).
   * The gateway forwards them upstream unmodified.
   */
  providerOptions?: Record<string, Record<string, unknown>>
  /** Retries on transient failures. Default 0 — TTS callers usually own their backoff. */
  maxRetries?: number
  /** Forwarded to the gateway as headers — useful for tagging spend by feature. */
  metadata?: Record<string, string>
}

export interface SpeechResult {
  /** Raw audio bytes as returned (a full container, or bare PCM — see mimeType). */
  bytes: Uint8Array
  /** e.g. `audio/wav`, `audio/mpeg`, or `audio/L16;rate=24000` for bare PCM. */
  mimeType: string
  /** Concrete model the gateway served the request from. */
  modelUsed: string
}

/**
 * Text-to-speech through the AI gateway. Returns raw bytes the caller can
 * store or post-process; container handling (wrapping bare PCM in a WAV
 * header, measuring duration) is the caller's job, since only it knows the
 * format it needs downstream.
 */
export async function generateSpeech(opts: GenerateSpeechOptions): Promise<SpeechResult> {
  const modelId = resolveModel(opts.model ?? 'speech.default')
  const res = await aiGenerateSpeech({
    model: getGatewayClient().speechModel(modelId),
    text: opts.text,
    voice: opts.voice,
    outputFormat: opts.outputFormat,
    instructions: opts.instructions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerOptions: opts.providerOptions as any,
    maxRetries: opts.maxRetries ?? 0,
    headers: opts.metadata,
  })
  return {
    bytes: res.audio.uint8Array,
    mimeType: res.audio.mediaType,
    modelUsed: modelId,
  }
}
