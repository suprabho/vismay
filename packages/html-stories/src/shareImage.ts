/**
 * The generated link-preview card for a published HTML story: the page's
 * first screen, as a reader sees it, beside the story's title and
 * description in its own palette, 1200×630. It is what /s/<slug> serves as
 * og:image and twitter:image (./seo), so a shared link shows the story
 * itself rather than whichever hero photo the author picked. The author's
 * og:image (html_stories.og_image_url) stays the cover on listing cards.
 *
 * The card needs a real browser, which Vercel functions can't host, so it is
 * rendered by .github/workflows/render-html-story-og.yml
 * (scripts/generate-share-image.ts, ./shareImageRender). Publishing queues it
 * (./publishApi and admin's save routes call queueHtmlStoryShareImage) when
 * the page, title, description or aura changed since the last card.
 *
 * Travel stories are private to a trip, so they get none.
 *
 * Server only — imports the service Supabase client.
 */

import { createHash } from 'node:crypto'
import { createServiceClient } from '@vismay/content-source/supabase'
import { dispatchWorker, isWorkerDispatchConfigured, type WorkerDef } from '@vismay/content-source/workerDispatch'
import type { HtmlStoryApp } from './apps'

/** Public bucket the card is hosted in (the same one as the story's own assets). */
export const HTML_STORY_SHARE_IMAGE_BUCKET = 'story-assets'
/** Its folder: html-story-og/<slug>/<hash>.png, apart from the author's uploads. */
export const HTML_STORY_SHARE_IMAGE_PREFIX = 'html-story-og'
export const HTML_STORY_SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const

/**
 * Bump when the card's layout changes, so the next publish of every story
 * renders it again (the hash below changes with it).
 */
export const HTML_STORY_SHARE_IMAGE_VERSION = 1

export const HTML_STORY_SHARE_IMAGE_WORKER: WorkerDef = {
  id: 'render-html-story-og',
  workflowFile: 'render-html-story-og.yml',
  label: 'HTML story share image',
  description: "Renders a published HTML story's link-preview card from a screenshot of the page.",
  schedule: 'on publish',
}

/** What the card is made from. */
export interface ShareImageSource {
  app: HtmlStoryApp
  html: string
  title: string
  description: string | null
  aura: string | null
}

/** The hash of what a card is made from: equal hashes, equal cards. */
export function shareImageHash(s: ShareImageSource): string {
  return createHash('sha256')
    .update(JSON.stringify([HTML_STORY_SHARE_IMAGE_VERSION, s.app, s.title, s.description ?? '', s.aura ?? '', s.html]))
    .digest('hex')
    .slice(0, 16)
}

/** Record a story's new card (or clear it with nulls). Leaves updated_at alone. */
export async function setHtmlStoryShareImage(slug: string, url: string | null, hash: string | null): Promise<void> {
  const { error } = await createServiceClient()
    .from('html_stories')
    .update({ share_image_url: url, share_image_hash: hash })
    .eq('slug', slug)
  if (error) throw new Error(`setHtmlStoryShareImage ${slug}: ${error.message}`)
}

export type QueueShareImageResult =
  | { mode: 'dispatched' }
  | { mode: 'unchanged' }
  | { mode: 'skipped'; reason: string }
  | { mode: 'unconfigured'; reason: string }
  | { mode: 'failed'; reason: string }

/**
 * Queue a published story's share card, unless the current one was made from
 * the same page, title, description and aura (`force` renders it anyway).
 * Never throws: a story publishes whether or not its card could be queued.
 */
export async function queueHtmlStoryShareImage(
  slug: string,
  app: HtmlStoryApp,
  { force = false }: { force?: boolean } = {},
): Promise<QueueShareImageResult> {
  if (app === 'travel') return { mode: 'skipped', reason: 'travel stories are private to a trip, so they get no share image' }
  if (!isWorkerDispatchConfigured()) {
    return { mode: 'unconfigured', reason: 'the share image was not queued: GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO are unset on this deployment' }
  }
  try {
    const { data, error } = await createServiceClient()
      .from('html_stories')
      .select('app_slug, status, title, description, aura, html, share_image_url, share_image_hash')
      .eq('slug', slug)
      .eq('app_slug', app)
      .maybeSingle()
    if (error) {
      // Before migration 107 there is nowhere to keep the card.
      if (error.code === '42703') return { mode: 'skipped', reason: 'share images need migration 107_html_stories_share_image.sql applied' }
      throw new Error(error.message)
    }
    if (!data) return { mode: 'skipped', reason: 'no such story' }
    if (data.status !== 'published') return { mode: 'skipped', reason: 'the story is not published' }
    const hash = shareImageHash({
      app,
      html: data.html,
      title: data.title,
      description: data.description ?? null,
      aura: data.aura ?? null,
    })
    if (!force && data.share_image_url && data.share_image_hash === hash) return { mode: 'unchanged' }
    await dispatchWorker(HTML_STORY_SHARE_IMAGE_WORKER, { slug, force: force ? 'true' : 'false' })
    return { mode: 'dispatched' }
  } catch (e) {
    return { mode: 'failed', reason: `the share image was not queued: ${e instanceof Error ? e.message : String(e)}` }
  }
}
