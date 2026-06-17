import { isAuthed } from '@/lib/adminAuth'

/**
 * Same-origin proxy for remote images placed on a Vizmaya share card (existing
 * story assets in the public `story-assets` bucket, generated images, etc.).
 * html-to-image rasterizes the card by cloning the DOM and re-fetching every
 * `<img>`; a cross-origin image either taints the canvas (capture throws) or
 * fails the CORS preflight. Routing it through this same-origin endpoint
 * sidesteps both. Auth-gated; http(s) only. (Verbatim port of the footshorts
 * share proxy-image route.)
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
