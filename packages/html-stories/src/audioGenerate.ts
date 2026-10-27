/**
 * The generator behind section audio (./audio): run by the GitHub Action
 * render-html-story-audio.yml through scripts/generate-audio.ts, never by a
 * serving route.
 *
 * Server only.
 */

import { hasGatewayCredentials } from '@vismay/ai-gateway'
import {
  DailyQuotaExhaustedError,
  isRiffWav,
  makeRateLimiter,
  synthesizeWithRetry,
  wavDurationMs,
  type TtsContext,
} from '@vismay/content-source/storyAudioGenerate'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  DEFAULT_HTML_STORY_VOICE,
  HTML_STORY_AUDIO_BUCKET,
  getHtmlStoryAudio,
  writeAudio,
  type HtmlStoryAudioSection,
} from './audio'
import { extractNarrationSections, htmlHash, splitForSpeech } from './narration'

/** The `fmt ` chunk and PCM payload of a WAV, for joining clips. */
function wavParts(wav: Buffer): { fmt: Buffer; data: Buffer } | null {
  if (!isRiffWav(wav)) return null
  let fmt: Buffer | null = null
  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') fmt = wav.subarray(offset, body + size)
    else if (id === 'data') {
      const available = wav.length - body
      const len = size === 0 || size > available ? available : size
      return fmt ? { fmt, data: wav.subarray(body, body + len) } : null
    }
    offset = body + size + (size % 2)
  }
  return null
}

/** Join WAVs of one format (each piece of a long section) into one. */
export function concatWavs(wavs: Buffer[]): Buffer {
  if (wavs.length === 1) return wavs[0]
  const parts = wavs.map(wavParts)
  if (parts.some((p) => !p)) throw new Error('cannot join: not a WAV')
  const { fmt } = parts[0]!
  const data = Buffer.concat(parts.map((p) => p!.data))
  const head = Buffer.alloc(12)
  head.write('RIFF', 0)
  head.writeUInt32LE(4 + fmt.length + 8 + data.length, 4)
  head.write('WAVE', 8)
  const dataHead = Buffer.alloc(8)
  dataHead.write('data', 0)
  dataHead.writeUInt32LE(data.length, 4)
  return Buffer.concat([head, fmt, dataHead, data])
}

export interface GenerateHtmlStoryAudioOptions {
  slug: string
  /** Re-voice every section, even ones whose clip already exists. */
  force?: boolean
  voice?: string
  /** Minimum ms between TTS calls (default `RATE_LIMIT_MS` env or 8000). */
  rateLimitMs?: number
}

export interface GenerateHtmlStoryAudioResult {
  slug: string
  sections: number
  voiced: number
  reused: number
  silent: number
  failed: number
}

/**
 * Voice a published story's sections and write its manifest. Sections whose
 * clip already exists (same text, same voice) reuse it. A section whose TTS
 * fails is left silent and the manifest is still written, marked failed with
 * the reason, so the rest plays; re-running fills the gaps.
 */
export async function generateHtmlStoryAudio(opts: GenerateHtmlStoryAudioOptions): Promise<GenerateHtmlStoryAudioResult> {
  const { slug, force = false } = opts
  const voice = opts.voice ?? process.env.HTML_STORY_AUDIO_VOICE ?? DEFAULT_HTML_STORY_VOICE
  if (!hasGatewayCredentials()) {
    throw new Error('AI gateway credentials missing: set AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) to voice HTML stories.')
  }
  const sb = createServiceClient()
  const { data: story, error } = await sb
    .from('html_stories')
    .select('slug, app_slug, status, html')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`generateHtmlStoryAudio ${slug}: ${error.message}`)
  if (!story) throw new Error(`no HTML story ${slug}`)
  if (story.status !== 'published') throw new Error(`${slug} is ${story.status}, not published`)
  if (story.app_slug === 'travel') throw new Error(`${slug} is a travel story: travel stories get no public audio`)

  const html = story.html as string
  const sections = extractNarrationSections(html, voice)
  const previous = await getHtmlStoryAudio(slug)
  const known = new Map<string, HtmlStoryAudioSection>()
  for (const s of previous?.sections ?? []) if (s.hash && s.url) known.set(s.hash, s)

  await writeAudio(slug, { status: 'generating', error: null })

  const tts: TtsContext = {
    voiceName: voice,
    rateLimit: makeRateLimiter(opts.rateLimitMs ?? Number(process.env.RATE_LIMIT_MS ?? 8000)),
  }
  const dir = `html-stories/${slug}`
  const out: HtmlStoryAudioSection[] = []
  const result: GenerateHtmlStoryAudioResult = { slug, sections: sections.length, voiced: 0, reused: 0, silent: 0, failed: 0 }
  let failure: string | null = null

  console.log(`\n━━━ ${slug} ━━━  ${sections.length} sections, voice ${voice}`)
  for (const s of sections) {
    const tag = `  [${s.index + 1}/${sections.length}] ${s.label}`
    if (!s.text) {
      console.log(`${tag}: silent`)
      out.push({ index: s.index, label: s.label, hash: null, url: null, durationMs: 0 })
      result.silent++
      continue
    }
    const reuse = known.get(s.hash)
    if (reuse && !force) {
      console.log(`${tag}: unchanged`)
      out.push({ ...reuse, index: s.index, label: s.label })
      result.reused++
      continue
    }

    process.stdout.write(`${tag}: voicing ${s.text.split(' ').length} words… `)
    let wav: Buffer | null = null
    try {
      const pieces: Buffer[] = []
      for (const piece of splitForSpeech(s.text)) {
        const buf = await synthesizeWithRetry(tts, piece)
        if (!buf) throw new Error('TTS failed')
        pieces.push(buf)
      }
      wav = concatWavs(pieces)
    } catch (e) {
      if (e instanceof DailyQuotaExhaustedError) failure = 'TTS daily quota exhausted; re-run to finish'
      else failure = `section ${s.index + 1}: ${e instanceof Error ? e.message : String(e)}`
    }
    if (!wav) {
      console.log('✗')
      out.push({ index: s.index, label: s.label, hash: null, url: null, durationMs: 0 })
      result.failed++
      if (failure?.startsWith('TTS daily quota')) break
      continue
    }

    const path = `${dir}/${s.hash}.wav`
    const { error: upErr } = await sb.storage
      .from(HTML_STORY_AUDIO_BUCKET)
      .upload(path, wav, { contentType: 'audio/wav', upsert: true, cacheControl: '31536000' })
    if (upErr) {
      console.log(`✗ upload: ${upErr.message}`)
      failure = `section ${s.index + 1}: upload failed: ${upErr.message}`
      out.push({ index: s.index, label: s.label, hash: null, url: null, durationMs: 0 })
      result.failed++
      continue
    }
    const url = sb.storage.from(HTML_STORY_AUDIO_BUCKET).getPublicUrl(path).data.publicUrl
    const durationMs = wavDurationMs(wav)
    console.log(`✓ ${(durationMs / 1000).toFixed(1)}s`)
    out.push({ index: s.index, label: s.label, hash: s.hash, url, durationMs })
    result.voiced++
  }
  // A quota stop leaves the remaining sections silent until the next run.
  for (const s of sections.slice(out.length)) {
    out.push({ index: s.index, label: s.label, hash: null, url: null, durationMs: 0 })
    if (s.text) result.failed++
  }

  await writeAudio(slug, {
    status: failure ? 'failed' : 'ready',
    error: failure,
    html_hash: htmlHash(html),
    voice,
    sections: out,
    duration_ms: out.reduce((n, s) => n + s.durationMs, 0),
    generated_at: new Date().toISOString(),
  })
  await pruneClips(slug, new Set(out.map((s) => s.hash).filter(Boolean) as string[]))

  console.log(`  Done: ${result.voiced} voiced, ${result.reused} unchanged, ${result.silent} silent, ${result.failed} failed`)
  return result
}

/** Remove clips no section of the new manifest uses. Best-effort. */
async function pruneClips(slug: string, keep: Set<string>): Promise<void> {
  const sb = createServiceClient()
  const dir = `html-stories/${slug}`
  const { data, error } = await sb.storage.from(HTML_STORY_AUDIO_BUCKET).list(dir, { limit: 1000 })
  if (error || !data) return
  const stale = data.map((f) => f.name).filter((n) => n.endsWith('.wav') && !keep.has(n.slice(0, -4)))
  if (stale.length) await sb.storage.from(HTML_STORY_AUDIO_BUCKET).remove(stale.map((n) => `${dir}/${n}`))
}
