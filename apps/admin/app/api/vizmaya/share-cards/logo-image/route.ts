import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'

/**
 * Fetch a single brand logo from Brandfetch's Logo CDN and return it as a
 * base64 data URL for the Vizmaya share-card composer.
 *
 * Logo API: https://docs.brandfetch.com/logo-api/parameters
 *   https://cdn.brandfetch.io/domain/{domain}/{k/v pairs}?c={CLIENT_ID}
 *
 * We build the CDN URL ourselves from a server-validated `domain` (never a
 * client-supplied URL — no SSRF surface) and embed the bytes so `html-to-image`
 * can rasterize the logo on capture without a cross-origin fetch (which would
 * taint the canvas). Requesting an explicit width forces Brandfetch to return a
 * raster (PNG/WebP) rather than an SVG, which captures more reliably.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LogoType = 'logo' | 'symbol' | 'icon'
type LogoTheme = 'light' | 'dark'

const LOGO_TYPES: readonly LogoType[] = ['logo', 'symbol', 'icon']
const RENDER_W = 512

/** Only real domains (`example.com`) — guards the CDN host we build below. */
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

function cdnUrl(domain: string, type: LogoType, theme: LogoTheme | null, clientId: string): string {
  const segs = [`type/${type}`]
  if (theme) segs.push(`theme/${theme}`)
  segs.push(`w/${RENDER_W}`, `h/${RENDER_W}`, 'fallback/404')
  return `https://cdn.brandfetch.io/domain/${domain}/${segs.join('/')}?c=${encodeURIComponent(clientId)}`
}

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const clientId = process.env.BRANDFETCH_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'logo fetch unavailable — set BRANDFETCH_CLIENT_ID' },
      { status: 501 },
    )
  }

  const params = new URL(req.url).searchParams
  const domain = params.get('domain')?.trim().toLowerCase() ?? ''
  if (!DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: 'invalid "domain"' }, { status: 400 })
  }
  const themeParam = params.get('theme')
  const theme: LogoTheme | null = themeParam === 'light' || themeParam === 'dark' ? themeParam : null
  const wanted = params.get('type') as LogoType | null

  // Try the requested style first, then fall back through the others (with
  // fallback/404 a brand that lacks a given variant 404s, so we move on).
  const order = [wanted && LOGO_TYPES.includes(wanted) ? wanted : 'logo', ...LOGO_TYPES].filter(
    (t, i, a) => a.indexOf(t) === i,
  ) as LogoType[]

  try {
    for (const type of order) {
      const res = await fetch(cdnUrl(domain, type, theme, clientId))
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength === 0) continue
      const mime = res.headers.get('content-type')?.split(';')[0] || 'image/png'
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      return NextResponse.json({ ok: true, dataUrl, domain, type })
    }
    return NextResponse.json({ error: 'no logo found for this brand' }, { status: 404 })
  } catch (e) {
    return NextResponse.json(
      { error: `brandfetch logo fetch failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
}
