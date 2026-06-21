import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'

/**
 * Fetch a single brand logo from Brandfetch's Logo CDN and return it as a
 * base64 data URL for the Vizmaya share-card composer.
 *
 * Logo API: https://docs.brandfetch.com/logo-api/parameters
 *
 * We base64-embed the bytes so `html-to-image` can rasterize the logo on
 * capture without a cross-origin fetch (which would taint the canvas).
 *
 * IMPORTANT: the Brandfetch CDN answers `200 text/html` with a ~450 kB app
 * page (not a 4xx) when a request is off — bad/missing client id, an unknown
 * brand, or an unsupported path. So we MUST verify each response is actually an
 * image (`content-type: image/*`) before accepting it; otherwise we'd embed an
 * HTML document as a fake "logo". We try the `icon` URL the search step already
 * proved renders, then a couple of higher-res domain forms, and accept the
 * first real image.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LogoType = 'logo' | 'symbol' | 'icon'
type LogoTheme = 'light' | 'dark'

const LOGO_TYPES: readonly LogoType[] = ['logo', 'symbol', 'icon']
const RENDER_W = 512

/** Only real domains (`example.com`) — guards the CDN host we build below. */
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/** Force `c` onto a Brandfetch CDN url, rejecting anything off-host (no SSRF). */
function brandfetchUrl(raw: string, clientId: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.hostname !== 'cdn.brandfetch.io') return null
  u.searchParams.set('c', clientId)
  return u.toString()
}

/** Documented logo-link form: cdn.brandfetch.io/{domain}/{params}?c=… */
function domainUrl(domain: string, type: LogoType, theme: LogoTheme | null, clientId: string): string {
  const segs = [`type/${type}`, `w/${RENDER_W}`, `h/${RENDER_W}`]
  if (theme) segs.push(`theme/${theme}`)
  segs.push('fallback/404')
  return `https://cdn.brandfetch.io/${domain}/${segs.join('/')}?c=${encodeURIComponent(clientId)}`
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
  const types = [wanted && LOGO_TYPES.includes(wanted) ? wanted : 'logo', ...LOGO_TYPES].filter(
    (t, i, a) => a.indexOf(t) === i,
  ) as LogoType[]

  // Candidate URLs, tried in order; first real image wins. The search `icon` is
  // proven to render but ignores `theme`, so when a light/dark variant is asked
  // for we try the theme-aware domain forms first and keep `icon` as a fallback.
  const iconUrl = (() => {
    const raw = params.get('icon')
    return raw ? brandfetchUrl(raw, clientId) : null
  })()
  const domainUrls = types.map((type) => domainUrl(domain, type, theme, clientId))
  const candidates = theme
    ? [...domainUrls, ...(iconUrl ? [iconUrl] : [])]
    : [...(iconUrl ? [iconUrl] : []), ...domainUrls]

  let lastCt = ''
  try {
    for (const url of candidates) {
      const res = await fetch(url)
      if (!res.ok) continue
      const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      lastCt = ct
      if (!ct.startsWith('image/')) continue // CDN served HTML / non-image — skip
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength === 0) continue
      const dataUrl = `data:${ct};base64,${buf.toString('base64')}`
      return NextResponse.json({ ok: true, dataUrl, domain })
    }
    return NextResponse.json(
      {
        error:
          'no logo image returned for this brand' +
          (lastCt && lastCt !== 'image/*' ? ` (Brandfetch served "${lastCt}" — check the client id is enabled for the Logo CDN)` : ''),
      },
      { status: 404 },
    )
  } catch (e) {
    return NextResponse.json(
      { error: `brandfetch logo fetch failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
}
