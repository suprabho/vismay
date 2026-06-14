import { isAuthed } from '@/lib/adminAuth'

/**
 * Same-origin proxy for remote news images. html-to-image rasterizes a card by
 * cloning the DOM and re-fetching every `<img>`; a cross-origin publisher image
 * either taints the canvas (capture throws) or fails the CORS preflight. Routing
 * the image through this same-origin endpoint sidesteps both — the browser sees a
 * first-party URL and the capture succeeds. Auth-gated; http(s) only.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response('unauthorized', { status: 401 })
  const url = new URL(req.url)
  const target = url.searchParams.get('url')
  if (!target) return new Response('missing "url"', { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return new Response('bad url', { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Response('unsupported protocol', { status: 400 })
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { 'user-agent': 'footshorts-share-card/1.0' },
    })
    if (!upstream.ok || !upstream.body) {
      return new Response('upstream error', { status: 502 })
    }
    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return new Response('not an image', { status: 415 })
    }
    return new Response(upstream.body, {
      headers: {
        'content-type': contentType,
        'cache-control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    return new Response(`fetch failed: ${e instanceof Error ? e.message : String(e)}`, {
      status: 502,
    })
  }
}
