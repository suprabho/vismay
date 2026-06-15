import { NextResponse } from 'next/server'

export const runtime = 'edge'

const ALLOWED_PREFIX = 'https://api.mapbox.com/styles/'

/**
 * Same-origin proxy for Mapbox Static Images. Share-mode PNG export uses
 * html-to-image, which deep-clones the DOM and re-fetches every <img src>
 * to inline as a data URL. Cross-origin requests against the Mapbox CDN
 * are flaky (CORS-tainted cache hits silently drop the background), so
 * we serve the bytes from our own origin instead.
 *
 * The Cache-Control header below makes Vercel's edge CDN cache each
 * unique URL for a year, so repeat exports don't re-hit the upstream
 * Mapbox API.
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url')
  if (!url || !url.startsWith(ALLOWED_PREFIX)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const upstream = await fetch(url, { cache: 'force-cache' })
  if (!upstream.ok) {
    return new NextResponse('Upstream error', { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  })
}
