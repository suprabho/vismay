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
    // Mimic a real browser: several image CDNs (incl. crests.football-data.org)
    // reset the connection or 403 on a non-browser User-Agent, which is why the
    // <img> loads when the browser fetches it directly but failed through the
    // proxy. The Referer (the image's own origin) clears most hotlink checks.
    const upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        referer: `${parsed.origin}/`,
      },
    })
    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, { status: 502 })
    }
    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return new Response('not an image', { status: 415 })
    }
    // Buffer rather than stream the body straight through — robust across
    // runtimes and lets us set an exact Content-Length.
    const bytes = Buffer.from(await upstream.arrayBuffer())
    return new Response(bytes, {
      headers: {
        'content-type': contentType,
        'content-length': String(bytes.byteLength),
        'cache-control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    return new Response(`fetch failed: ${e instanceof Error ? e.message : String(e)}`, {
      status: 502,
    })
  }
}
