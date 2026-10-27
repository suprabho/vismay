/**
 * Which voice narrates HTML stories (./audioGenerate), and how one passage is
 * spoken. Two providers:
 *
 *   - `elevenlabs`: ElevenLabs, called directly (it isn't on the AI
 *     gateway): `@vismay/ai-gateway/elevenlabs`. The default whenever
 *     ELEVENLABS_API_KEY is set.
 *   - `gemini`: Gemini TTS through the AI gateway, with the viz-engine story
 *     audio's retry and quota handling.
 *
 * Env (all optional): HTML_STORY_AUDIO_PROVIDER (`elevenlabs` | `gemini`),
 * HTML_STORY_AUDIO_VOICE (an ElevenLabs voice id, or a Gemini voice name),
 * HTML_STORY_AUDIO_MODEL (an ElevenLabs model id, or a gateway speech alias
 * such as `speech.lite`), RATE_LIMIT_MS.
 *
 * The voice's key (provider, model, voice) is part of every clip's hash, so
 * changing any of them re-voices each section on the next run.
 *
 * Server only.
 */

import { hasGatewayCredentials } from '@vismay/ai-gateway'
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_VOICE,
  ElevenLabsError,
  generateElevenLabsSpeech,
  hasElevenLabsCredentials,
} from '@vismay/ai-gateway/elevenlabs'
import {
  DailyQuotaExhaustedError,
  makeRateLimiter,
  synthesizeWithRetry,
  toWavBuffer,
} from '@vismay/content-source/storyAudioGenerate'
import { DEFAULT_HTML_STORY_VOICE } from './audio'

export type NarrationProvider = 'elevenlabs' | 'gemini'

export interface NarrationVoice {
  provider: NarrationProvider
  voice: string
  model: string
  /** Hashed into each clip and stored on the manifest: `gemini` keeps the bare voice name. */
  key: string
}

export function narrationVoiceFromEnv(env: Record<string, string | undefined> = process.env): NarrationVoice {
  // `|| undefined`: the workflow passes an unset repo variable as '', which
  // `??` below would keep as the provider.
  const asked = env.HTML_STORY_AUDIO_PROVIDER?.trim().toLowerCase() || undefined
  if (asked && asked !== 'elevenlabs' && asked !== 'gemini') {
    throw new Error(`HTML_STORY_AUDIO_PROVIDER must be elevenlabs or gemini, not ${asked}`)
  }
  const provider: NarrationProvider = (asked as NarrationProvider | undefined) ?? (env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'gemini')
  const voiceEnv = env.HTML_STORY_AUDIO_VOICE?.trim() || undefined
  const modelEnv = env.HTML_STORY_AUDIO_MODEL?.trim() || undefined
  if (provider === 'elevenlabs') {
    const voice = voiceEnv ?? DEFAULT_ELEVENLABS_VOICE
    const model = modelEnv ?? DEFAULT_ELEVENLABS_MODEL
    return { provider, voice, model, key: `elevenlabs:${model}:${voice}` }
  }
  const voice = voiceEnv ?? DEFAULT_HTML_STORY_VOICE
  const model = modelEnv ?? 'speech.default'
  // The default model keeps the bare voice name, so clips made before the
  // provider switch existed are still reused.
  return { provider, voice, model, key: model === 'speech.default' ? voice : `gemini:${model}:${voice}` }
}

/** Throws when the provider's credentials are missing. */
export function assertNarrationCredentials(v: NarrationVoice): void {
  if (v.provider === 'elevenlabs' && !hasElevenLabsCredentials()) {
    throw new Error('ELEVENLABS_API_KEY is not set: set it, or HTML_STORY_AUDIO_PROVIDER=gemini.')
  }
  if (v.provider === 'gemini' && !hasGatewayCredentials()) {
    throw new Error('AI gateway credentials missing: set AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) to voice HTML stories.')
  }
}

/** Speaks one piece of a passage as a WAV. Throws on failure; DailyQuotaExhaustedError when out of quota. */
export type Speaker = (piece: string, around: { previous?: string; next?: string }) => Promise<Buffer>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function makeSpeaker(v: NarrationVoice, { rateLimitMs }: { rateLimitMs?: number } = {}): Speaker {
  // Gemini's per-minute quota wants spacing; ElevenLabs only caps concurrency.
  const rateLimit = makeRateLimiter(rateLimitMs ?? Number(process.env.RATE_LIMIT_MS ?? (v.provider === 'gemini' ? 8000 : 0)))

  if (v.provider === 'gemini') {
    const ctx = { voiceName: v.voice, model: v.model, rateLimit }
    return async (piece) => {
      const wav = await synthesizeWithRetry(ctx, piece)
      if (!wav) throw new Error('TTS failed')
      return wav
    }
  }

  return async (piece, around) => {
    for (let attempt = 1; ; attempt++) {
      await rateLimit()
      try {
        const res = await generateElevenLabsSpeech({
          text: piece,
          voiceId: v.voice,
          modelId: v.model,
          previousText: around.previous,
          nextText: around.next,
        })
        const wav = toWavBuffer(res.bytes, res.mimeType)
        if (!wav) throw new Error(`unexpected audio format ${res.mimeType}`)
        return wav
      } catch (e) {
        if (!(e instanceof ElevenLabsError)) throw e
        if (e.quotaExceeded) throw new DailyQuotaExhaustedError()
        // 429: too many concurrent requests or a burst; 5xx: their side.
        if ((e.statusCode !== 429 && e.statusCode < 500) || attempt >= 5) throw e
        const hinted = Number(e.responseHeaders['retry-after'])
        await sleep(Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 : Math.min(60_000, 5_000 * 2 ** (attempt - 1)))
      }
    }
  }
}
