/**
 * Serving a published HTML story at a site's /s/<slug>: the document exactly as
 * posted (./htmlStories), wrapped only in the site's header and footer
 * (./branding), over its aura scene when one is set. No React shell, no viz
 * engine — the document is the whole page.
 *
 * The page is arbitrary third-party-ish HTML on our domain, so it is served
 * under a CSP sandbox without allow-same-origin: scripts run, but in an opaque
 * origin with no access to the site's cookies or storage. The agent brief
 * tells authors to expect that.
 *
 * Shared by vizmaya-fyi, footshorts, vizf1 and viznba, whose route handlers are
 * one line each, and travel, which checks the trip's password first.
 * Server only.
 */

import { HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import { brandHtmlStory } from './branding'
import { getPublishedHtmlStory, type HtmlStory } from './htmlStories'
import { HTML_STORY_SANDBOX_CSP, isSafeSlug } from './meta'
import { injectHtmlStorySeo } from './seo'

const NOT_FOUND_LOOK: Record<HtmlStoryApp, { bg: string; fg: string; link: string; font: string }> = {
  'vizmaya-fyi': { bg: '#0a0e14', fg: '#e0ddd5', link: '#D85A30', font: "-apple-system,'Segoe UI',Inter,sans-serif" },
  footshorts: { bg: '#0B0B0F', fg: '#F4F4F5', link: '#F26A3C', font: "'Space Grotesk',-apple-system,'Segoe UI',sans-serif" },
  vizf1: { bg: '#0b0d12', fg: '#f5f5f5', link: '#ff4346', font: "Saira,-apple-system,'Segoe UI',sans-serif" },
  viznba: { bg: '#0b0d12', fg: '#f5f5f5', link: '#ff8a3d', font: "Saira,-apple-system,'Segoe UI',sans-serif" },
  travel: { bg: '#f6f1e7', fg: '#2b2419', link: '#c94f2c', font: "Manrope,-apple-system,'Segoe UI',sans-serif" },
}

function notFoundHtml(app: HtmlStoryApp): string {
  const meta = HTML_STORY_APP_META[app]
  const c = NOT_FOUND_LOOK[app]
  const home = app === 'footshorts' ? '/feed' : '/'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Story not found · ${meta.name}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${c.bg};color:${c.fg};font:18px/1.6 ${c.font}}a{color:${c.link}}</style>
</head><body><main><p>This story doesn't exist or isn't published yet.</p><p><a href="${home}">Back to ${meta.name}</a></p></main></body></html>`
}

/** The app's "story not found" page. `private` keeps it out of shared caches. */
export function htmlStoryNotFound(app: HtmlStoryApp, { private: isPrivate = false }: { private?: boolean } = {}): Response {
  return new Response(notFoundHtml(app), {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': isPrivate ? 'private, no-store' : 'public, s-maxage=30',
    },
  })
}

export interface HtmlStoryResponseOptions {
  /**
   * A page only some visitors may see (travel's trip-password stories): no
   * shared caching, so a CDN never hands it to someone without the cookie,
   * and kept out of search indexes.
   */
  private?: boolean
}

/**
 * A story document as served: wrapped in its site's chrome (`?embed=1` drops
 * the header and footer), under the sandbox CSP. A public story also gets its
 * SEO head (./seo); a private one is served exactly as written, with no
 * canonical or JSON-LD pointing a crawler at it.
 */
export function htmlStoryResponse(req: Request, story: HtmlStory, app: HtmlStoryApp, opts?: { private?: false }): Response
export function htmlStoryResponse(
  req: Request,
  story: Pick<HtmlStory, 'html' | 'aura' | 'updatedAt'>,
  app: HtmlStoryApp,
  opts: { private: true },
): Response
export function htmlStoryResponse(
  req: Request,
  story: Pick<HtmlStory, 'html' | 'aura' | 'updatedAt'>,
  app: HtmlStoryApp,
  { private: isPrivate = false }: HtmlStoryResponseOptions = {},
): Response {
  const url = new URL(req.url)
  const embed = url.searchParams.get('embed') === '1'
  // Canonical, robots, missing OG/article tags and NewsArticle JSON-LD (./seo),
  // read from the author's own <head> before the chrome goes in.
  const doc = isPrivate ? story.html : injectHtmlStorySeo(story.html, story as HtmlStory, { embed })
  const html = brandHtmlStory(doc, {
    siteUrl: url.origin,
    aura: story.aura,
    app,
    chrome: !embed,
  })
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // The embed is the same story at a second URL; keep it out of the index.
      ...(embed ? { 'x-robots-tag': 'noindex, follow' } : {}),
      'content-security-policy': HTML_STORY_SANDBOX_CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'last-modified': new Date(story.updatedAt).toUTCString(),
      ...(isPrivate
        ? { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' }
        : // Re-posts show up within a minute; the CDN keeps serving the last
          // good copy while it refetches.
          { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=86400' }),
    },
  })
}

/**
 * GET /s/[slug] for one app. `?embed=1` serves it chrome-less (aura, no site
 * header/footer) for a host app that frames it under its own back button,
 * the same flag the render service's story view takes.
 *
 * Public stories only: travel gates its pages behind a trip's password and
 * serves them through htmlStoryResponse itself (apps/travel/web/app/s/[slug]).
 */
export async function serveHtmlStory(req: Request, slug: string, app: HtmlStoryApp): Promise<Response> {
  const story = isSafeSlug(slug) ? await getPublishedHtmlStory(slug, app) : null
  if (!story) return htmlStoryNotFound(app)
  return htmlStoryResponse(req, story, app)
}
