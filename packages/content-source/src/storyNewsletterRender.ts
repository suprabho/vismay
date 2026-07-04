/**
 * Server-side: render a story's HTML newsletter.
 *
 * Two-phase render:
 *   1. Playwright drives the /story/<slug>/newsletter capture surface,
 *      waits for the shared `window.__pdfReady__` readiness signal, then
 *      element-screenshots every `[data-newsletter-visual]` block (maps,
 *      charts, deck panels) and uploads the PNGs to the `story-newsletter`
 *      bucket. Skipped entirely when the issue has no visuals.
 *   2. Pure HTML assembly (storyNewsletterHtml.ts) stitches the story text +
 *      captured image URLs into the email variant and the Substack-paste
 *      variant, uploads both, and upserts the `story_newsletters` cache row.
 *
 * Mirrors storyShareRender.ts: lives in content-source with `playwright` as
 * a peer dep, and the caller mints the signed capture URL (the /newsletter
 * route is HMAC-gated on consumer TLDs — see docs/auth.md) so this package
 * stays decoupled from admin-core.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { getContentSource } from './contentSource'
import { getStoryContent } from './content'
import { loadStoryConfig } from './storyConfig'
import { resolveUnits } from './resolveUnits'
import {
  computeNewsletterRevisionHash,
  getCachedNewsletter,
  NEWSLETTER_BUCKET,
  newsletterImagePath,
  newsletterStoragePath,
  newsletterSubstackPath,
} from './storyNewsletter'
import {
  parseNewsletterConfig,
  resolveNewsletterBlocks,
  type NewsletterBlock,
} from './storyNewsletterConfig'
import {
  buildEmailHtml,
  buildSubstackHtml,
  type NewsletterHtmlBlock,
  type NewsletterHtmlImage,
} from './storyNewsletterHtml'

// The capture surface lays blocks out at 1200px so the PNGs display at 600px
// in the email at 2x density. Tall enough viewport that lazy mounts are
// irrelevant — the shell mounts everything eagerly in capture mode.
const CAPTURE_VIEWPORT = { width: 1200, height: 1600 }

// Same rationale as storyPdfRender.ts: the in-page readiness fallback is
// 120s and only arms after hydration, so give the whole wait real headroom.
const READY_TIMEOUT_MS = 300_000

export interface NewsletterRenderResult {
  public_url: string
  substack_url: string
  cached: boolean
  content_revision_hash: string
}

async function uploadObject(args: {
  supabase: SupabaseClient
  path: string
  body: Buffer | string
  contentType: string
}): Promise<string> {
  const payload = typeof args.body === 'string' ? Buffer.from(args.body, 'utf8') : args.body
  const { error } = await args.supabase.storage
    .from(NEWSLETTER_BUCKET)
    .upload(args.path, payload, { contentType: args.contentType, upsert: true })
  if (error) throw new Error(`upload ${args.path}: ${error.message}`)
  return args.supabase.storage.from(NEWSLETTER_BUCKET).getPublicUrl(args.path).data.publicUrl
}

async function captureVisuals(args: {
  slug: string
  captureUrl: string
  blocks: NewsletterBlock[]
  supabase: SupabaseClient
  hash: string
  log: (m: string) => void
}): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const keys = args.blocks.flatMap((b) => b.visuals.map((v) => v.key))
  if (keys.length === 0) return urls

  const browser = await chromium.launch({
    args: [
      '--disable-blink-features=AutomationControlled',
      // One live Mapbox canvas per map block, mounted eagerly — same WebGL
      // context-eviction guard as the PDF renderer.
      '--max-active-webgl-contexts=64',
    ],
  })
  try {
    const context = await browser.newContext({
      viewport: CAPTURE_VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    })
    const page = await context.newPage()
    page.on('pageerror', (err) => args.log(`pageerror: ${err.message}`))

    args.log(`navigating: ${args.captureUrl}`)
    await page.goto(args.captureUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })

    args.log('waiting for window.__pdfReady__')
    await page.waitForFunction(
      () => (window as unknown as { __pdfReady__?: boolean }).__pdfReady__ === true,
      undefined,
      { timeout: READY_TIMEOUT_MS }
    )

    for (const key of keys) {
      const el = page.locator(`[data-newsletter-visual="${key}"]`)
      if ((await el.count()) === 0) {
        args.log(`  ✗ ${key}: marker not found on capture surface`)
        continue
      }
      args.log(`  capturing ${key}`)
      const png = Buffer.from(await el.first().screenshot({ type: 'png' }))
      const publicUrl = await uploadObject({
        supabase: args.supabase,
        path: newsletterImagePath(args.slug, key),
        body: png,
        contentType: 'image/png',
      })
      // Storage paths are stable per key; bust CDN caches per content hash.
      urls.set(key, `${publicUrl}?v=${args.hash.slice(0, 12)}`)
    }

    await context.close()
  } finally {
    await browser.close()
  }
  return urls
}

export async function renderStoryNewsletter(args: {
  supabase: SupabaseClient
  slug: string
  /**
   * Signed URL of the capture surface, e.g.
   *   signOutputUrl({ baseUrl, path: `/story/${slug}/newsletter`,
   *                   ttlSeconds: 14 * 60, query: { print: '1' } })
   */
  captureUrl: string
  /** Canonical public URL of the interactive story (CTA + footer target). */
  storyUrl: string
  force?: boolean
  log?: (m: string) => void
}): Promise<NewsletterRenderResult> {
  const log = args.log ?? (() => {})
  const source = getContentSource()
  const contentRevisionHash = await computeNewsletterRevisionHash(source, args.slug)

  if (!args.force) {
    const existing = await getCachedNewsletter(args.supabase, args.slug)
    if (
      existing &&
      existing.public_url &&
      existing.content_revision_hash === contentRevisionHash
    ) {
      log(`cached (hash match) → ${existing.public_url}`)
      return {
        public_url: existing.public_url,
        substack_url: existing.substack_url ?? existing.public_url,
        cached: true,
        content_revision_hash: contentRevisionHash,
      }
    }
  }

  // Drafts are renderable — the newsletter is an editorial artifact minted
  // from signed admin surfaces, same policy as the canvas frame.
  const story = await getStoryContent(args.slug, { allowDraft: true })
  const config = await loadStoryConfig(args.slug)
  const { units } = resolveUnits(args.slug, story.sections, config)
  const newsletterCfg = parseNewsletterConfig(await source.readNewsletterYaml(args.slug))
  const blocks = resolveNewsletterBlocks(
    units,
    newsletterCfg,
    story.frontmatter.format ?? 'map'
  )

  const visualCount = blocks.reduce((n, b) => n + b.visuals.length, 0)
  log(`rendering: ${blocks.length} blocks, ${visualCount} visuals`)

  const imageUrls = await captureVisuals({
    slug: args.slug,
    captureUrl: args.captureUrl,
    blocks,
    supabase: args.supabase,
    hash: contentRevisionHash,
    log,
  })

  const htmlBlocks: NewsletterHtmlBlock[] = blocks.map((b) => ({
    kind: b.kind,
    eyebrow: b.eyebrow,
    heading: b.heading,
    subheading: b.subheading,
    paragraphs: b.paragraphs,
    caption: b.caption,
    images: b.visuals
      .map((v): NewsletterHtmlImage | null => {
        const url = imageUrls.get(v.key)
        return url ? { url, kind: v.kind } : null
      })
      .filter((i): i is NewsletterHtmlImage => i !== null),
  }))

  const htmlInput = {
    title: story.frontmatter.title,
    subtitle: story.frontmatter.subtitle,
    byline: story.frontmatter.byline,
    storyUrl: args.storyUrl,
    accentColor: story.frontmatter.theme?.colors?.accent,
    config: newsletterCfg,
    blocks: htmlBlocks,
  }

  log('uploading html artifacts')
  const publicUrl = await uploadObject({
    supabase: args.supabase,
    path: newsletterStoragePath(args.slug),
    body: buildEmailHtml(htmlInput),
    contentType: 'text/html; charset=utf-8',
  })
  const substackUrl = await uploadObject({
    supabase: args.supabase,
    path: newsletterSubstackPath(args.slug),
    body: buildSubstackHtml(htmlInput),
    contentType: 'text/html; charset=utf-8',
  })

  const { error: dbErr } = await args.supabase.from('story_newsletters').upsert(
    {
      slug: args.slug,
      storage_path: newsletterStoragePath(args.slug),
      public_url: publicUrl,
      substack_url: substackUrl,
      content_revision_hash: contentRevisionHash,
      dispatched_at: null,
    },
    { onConflict: 'slug' }
  )
  if (dbErr) throw new Error(`db upsert: ${dbErr.message}`)

  log(`✓ ${publicUrl}`)
  return {
    public_url: publicUrl,
    substack_url: substackUrl,
    cached: false,
    content_revision_hash: contentRevisionHash,
  }
}
