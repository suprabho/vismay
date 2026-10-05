import { getPublishedHtmlStory } from '@vismay/html-stories/htmlStories'
import { brandHtmlStory } from '@vismay/html-stories/branding'
import { isSafeSlug } from '@vismay/html-stories/meta'

/**
 * Serves an agent-authored HTML story as it was posted (migration 085,
 * packages/html-stories), wrapped only in the vizmaya header and footer
 * (packages/html-stories/src/branding.ts). No React shell, no viz engine: the
 * document is the whole page.
 *
 * The page is arbitrary third-party-ish HTML on our domain, so it is served
 * under a CSP sandbox without allow-same-origin: scripts run, but in an opaque
 * origin with no access to vizmaya.fyi cookies or storage. The agent brief
 * tells authors to expect that.
 */

export const dynamic = 'force-dynamic'

const SANDBOX =
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms ' +
  'allow-modals allow-downloads allow-presentation'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const story = isSafeSlug(slug) ? await getPublishedHtmlStory(slug) : null
  if (!story) {
    return new Response(NOT_FOUND, {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=30' },
    })
  }
  const html = brandHtmlStory(story.html, { siteUrl: new URL(req.url).origin })
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': SANDBOX,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'last-modified': new Date(story.updatedAt).toUTCString(),
      // Re-posts show up within a minute; the CDN keeps serving the last good
      // copy while it refetches.
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=86400',
    },
  })
}

const NOT_FOUND = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Story not found · vizmaya</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0e14;color:#e0ddd5;font:18px/1.6 -apple-system,'Segoe UI',Inter,sans-serif}a{color:#D85A30}</style>
</head><body><main><p>This story doesn't exist or isn't published yet.</p><p><a href="/">Back to vizmaya</a></p></main></body></html>`
