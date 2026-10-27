/** Checks for the narration voice switch and the ElevenLabs speaker, against a stubbed fetch.
 *  (run: npx tsx src/narrationVoice.test.ts) */
import assert from 'node:assert/strict'
import { DailyQuotaExhaustedError, wavDurationMs } from '@vismay/content-source/storyAudioGenerate'
import { makeSpeaker, narrationVoiceFromEnv } from './narrationVoice'

// Choosing the voice.
assert.deepEqual(narrationVoiceFromEnv({}), { provider: 'gemini', voice: 'Orus', model: 'speech.default', key: 'Orus' })
assert.equal(narrationVoiceFromEnv({ HTML_STORY_AUDIO_MODEL: 'speech.lite' }).key, 'gemini:speech.lite:Orus')
const el = narrationVoiceFromEnv({ ELEVENLABS_API_KEY: 'k' })
assert.equal(el.provider, 'elevenlabs', 'a key picks ElevenLabs')
assert.equal(el.key, 'elevenlabs:eleven_multilingual_v2:JBFqnCBsd6RMkjVDRZzb')
assert.equal(narrationVoiceFromEnv({ ELEVENLABS_API_KEY: 'k', HTML_STORY_AUDIO_PROVIDER: 'gemini' }).provider, 'gemini')
assert.equal(
  narrationVoiceFromEnv({ HTML_STORY_AUDIO_PROVIDER: 'ElevenLabs', HTML_STORY_AUDIO_VOICE: 'v1', HTML_STORY_AUDIO_MODEL: 'eleven_flash_v2_5' }).key,
  'elevenlabs:eleven_flash_v2_5:v1',
)
assert.throws(() => narrationVoiceFromEnv({ HTML_STORY_AUDIO_PROVIDER: 'polly' }))

async function main() {
  process.env.ELEVENLABS_API_KEY = 'test-key'
  const calls: { url: string; init: RequestInit }[] = []
  let replies: Response[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return replies.shift()!
  }) as typeof fetch
  const pcm = (ms: number) => new Response(new Uint8Array(24 * ms * 2), { status: 200 })
  const speak = makeSpeaker(narrationVoiceFromEnv({ ELEVENLABS_API_KEY: 'k', HTML_STORY_AUDIO_VOICE: 'voice-1' }), { rateLimitMs: 0 })

  // A piece: the right request, PCM back as a WAV of the right length.
  replies = [pcm(500)]
  const wav = await speak('Second part.', { previous: 'First part.', next: 'Third part.' })
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wavDurationMs(wav), 500)
  assert.equal(calls[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=pcm_24000')
  assert.equal((calls[0].init.headers as Record<string, string>)['xi-api-key'], 'test-key')
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    text: 'Second part.',
    model_id: 'eleven_multilingual_v2',
    previous_text: 'First part.',
    next_text: 'Third part.',
  })

  // eleven_v3 doesn't take the neighbouring text.
  calls.length = 0
  replies = [pcm(100)]
  await makeSpeaker(narrationVoiceFromEnv({ ELEVENLABS_API_KEY: 'k', HTML_STORY_AUDIO_MODEL: 'eleven_v3' }), { rateLimitMs: 0 })('x y z.', { previous: 'a.' })
  assert.equal(JSON.parse(calls[0].init.body as string).previous_text, undefined)

  // 429 is retried (honouring retry-after); a quota error stops the run; a 400 fails the section.
  calls.length = 0
  replies = [new Response('{"detail":{"status":"too_many_concurrent_requests"}}', { status: 429, headers: { 'retry-after': '0.01' } }), pcm(100)]
  assert.equal(wavDurationMs(await speak('again.', {})), 100)
  assert.equal(calls.length, 2)
  replies = [new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 })]
  await assert.rejects(speak('more.', {}), DailyQuotaExhaustedError)
  replies = [new Response('{"detail":{"status":"voice_not_found"}}', { status: 400 })]
  await assert.rejects(speak('more.', {}), /ElevenLabs 400/)

  console.log('narrationVoice: ok')
}
main()
