/**
 * Section-wise audio for published HTML stories.
 *
 * Publishing a story (the token-gated API, the MCP tool and the admin editor
 * all end in ./publishApi or the admin routes) queues a GitHub Action,
 * render-html-story-audio.yml, which runs scripts/generate-audio.ts →
 * generateHtmlStoryAudio (./audioGenerate): the page's sections (./narration) are voiced
 * one clip apiece by ElevenLabs or Gemini TTS (./narrationVoice) and the clips'
 * manifest lands in html_story_audio (migration 097). /s/<slug> reads the
 * manifest ({@link playableHtmlStoryAudio}) and injects the player
 * (./audioPlayer) while it matches the HTML being served.
 *
 * Clips are content-addressed (`story-audio/html-stories/<slug>/<hash>.wav`),
 * so a re-post re-voices only the sections whose text changed, and a story
 * published again unchanged costs nothing. Travel stories are private to a
 * trip, and the bucket is public, so they get no audio.
 *
 * Server only. Light enough for the serving routes: the generator, with
 * cheerio and the TTS client, lives in ./audioGenerate.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { dispatchWorker, isWorkerDispatchConfigured, type WorkerDef } from '@vismay/content-source/workerDispatch'
import type { HtmlStoryApp } from './apps'
import { htmlHash } from './narrationRule'

export const HTML_STORY_AUDIO_BUCKET = 'story-audio'
/** Gemini prebuilt voice, as the viz-engine story audio uses. */
export const DEFAULT_HTML_STORY_VOICE = 'Orus'

export const HTML_STORY_AUDIO_WORKER: WorkerDef = {
  id: 'render-html-story-audio',
  workflowFile: 'render-html-story-audio.yml',
  label: 'HTML story audio',
  description: 'Voices a published HTML story section by section.',
  schedule: 'on publish',
}

export type HtmlStoryAudioStatus = 'pending' | 'generating' | 'ready' | 'failed'

export interface HtmlStoryAudioSection {
  index: number
  label: string
  /** Null for a silent section (data-no-narrate, or too short to voice). */
  hash: string | null
  url: string | null
  durationMs: number
}

export interface HtmlStoryAudio {
  slug: string
  status: HtmlStoryAudioStatus
  htmlHash: string | null
  voice: string | null
  sections: HtmlStoryAudioSection[]
  durationMs: number
  error: string | null
  requestedAt: string
  generatedAt: string | null
}

/** Missing table (before migration 097): PostgREST's 42P01 / PGRST205. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

function mapAudio(r: any): HtmlStoryAudio {
  return {
    slug: r.slug,
    status: r.status,
    htmlHash: r.html_hash ?? null,
    voice: r.voice ?? null,
    sections: Array.isArray(r.sections) ? r.sections : [],
    durationMs: r.duration_ms ?? 0,
    error: r.error ?? null,
    requestedAt: r.requested_at,
    generatedAt: r.generated_at ?? null,
  }
}

/** A story's audio manifest, or null (none yet, or migration 097 not applied). */
export async function getHtmlStoryAudio(slug: string): Promise<HtmlStoryAudio | null> {
  const { data, error } = await createServiceClient().from('html_story_audio').select('*').eq('slug', slug).maybeSingle()
  if (isMissingTable(error)) return null
  if (error) throw new Error(`getHtmlStoryAudio ${slug}: ${error.message}`)
  return data ? mapAudio(data) : null
}

/**
 * The clips the player can offer for this document: the manifest's sections,
 * when it was made from exactly this HTML and voices at least one. Null when
 * there is nothing to play.
 */
export function playableHtmlStoryAudio(audio: HtmlStoryAudio | null, html: string): HtmlStoryAudioSection[] | null {
  if (!audio || audio.htmlHash !== htmlHash(html)) return null
  return audio.sections.some((s) => s.url) ? audio.sections : null
}

/** Upsert a story's manifest row; a no-op before migration 097. */
export async function writeAudio(slug: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await createServiceClient()
    .from('html_story_audio')
    .upsert({ slug, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'slug' })
  if (error && !isMissingTable(error)) throw new Error(`html_story_audio ${slug}: ${error.message}`)
}

export type QueueAudioResult =
  | { mode: 'dispatched' }
  | { mode: 'unchanged' }
  | { mode: 'skipped' | 'unconfigured' | 'failed'; reason: string }

/**
 * Queue section audio for a story that is now published. Cheap to call on
 * every publish: a manifest already made from this HTML is left alone unless
 * `force`. Never throws: the publish has already succeeded, so a failure
 * comes back as a reason for the caller's warnings.
 */
export async function queueHtmlStoryAudio(
  story: { slug: string; app: HtmlStoryApp; html?: string },
  { force = false }: { force?: boolean } = {},
): Promise<QueueAudioResult> {
  if (story.app === 'travel') {
    return { mode: 'skipped', reason: 'travel stories are private to a trip, so they get no public audio' }
  }
  if (!isWorkerDispatchConfigured()) {
    return { mode: 'unconfigured', reason: 'section audio was not queued: GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO are unset on this deployment' }
  }
  try {
    if (!force && story.html) {
      const audio = await getHtmlStoryAudio(story.slug)
      if (audio?.status === 'ready' && audio.htmlHash === htmlHash(story.html)) return { mode: 'unchanged' }
    }
    await writeAudio(story.slug, { status: 'pending', error: null, requested_at: new Date().toISOString() })
    await dispatchWorker(HTML_STORY_AUDIO_WORKER, { slug: story.slug, force: force ? 'true' : 'false' })
    return { mode: 'dispatched' }
  } catch (e) {
    return { mode: 'failed', reason: `section audio was not queued: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** A publish response's warning for a queue result, or null when there is nothing to say. */
export function audioQueueWarning(result: QueueAudioResult): string | null {
  return result.mode === 'unconfigured' || result.mode === 'failed' ? `Saved, but ${result.reason}.` : null
}
