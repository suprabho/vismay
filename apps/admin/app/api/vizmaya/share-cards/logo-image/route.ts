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
 * Two Brandfetch quirks drive the design:
 *
 * 1. The CDN does NOT accept your raw client id. The Search API mints a signed,
 *    *ephemeral* token (`c=1ax{timestamp}…`) and bakes it into the `icon` URLs
 *    it returns; only that token works against `cdn.brandfetch.io`. So we reuse
 *    the token + identifier from the search result's `icon` URL (passed in by
 *    the picker) and must NEVER override its `c`.
 * 2. On a bad request — wrong/empty token, unknown identifier — the CDN answers
 *    `200 text/html` with a ~450 kB app page, not a 4xx. So we accept a response
 *    only when `content-type` is `image/*`; otherwise we'd embed HTML as a
 *    "logo". The token works for any CDN path, so we derive higher-res `logo` /
 *    `symbol` variants from the same identifier, then fall back to the original
 *    icon URL (which has a lettermark fallback and always yields an image).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LogoType = 'logo' | 'symbol' | 'icon'
type LogoTheme = 'light' | 'dark'

const LOGO_TYPES: readonly LogoType[] = ['logo', 'symbol', 'icon']
const RENDER_W = 512

/** Pull the identifier + signed CDN token out of a search-result `icon` URL,
 *  rejecting anything not on the Brandfetch CDN host (no SSRF surface). */
function parseIconUrl(raw: string | null): { id: string; token: string } | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.hostname !== 'cdn.brandfetch.io') return null
  const id = u.pathname.split('/').filter(Boolean)[0]
  const token = u.searchParams.get('c')
  if (!id || !token) return null
  return { id, token }
}

/** Build a CDN logo url for an identifier, reusing the ephemeral token. The
 *  type is a path segment (`/logo`), matching the form the Search API returns.
 *  `fallback/404` makes a missing variant 404 so we fall through to the next. */
function cdnUrl(id: string, type: LogoType, theme: LogoTheme | null, token: string): string {
  const segs = [`w/${RENDER_W}`, `h/${RENDER_W}`]
  if (theme) segs.push(`theme/${theme}`)
  segs.push('fallback/404', type)
  return `https://cdn.brandfetch.io/${id}/${segs.join('/')}?c=${encodeURIComponent(token)}`
}

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const rawIcon = params.get('icon')
  const parsed = parseIconUrl(rawIcon)
  if (!parsed || !rawIcon) {
    return NextResponse.json(
      { error: 'missing a Brandfetch "icon" url to derive the logo from' },
      { status: 400 },
    )
  }

  const themeParam = params.get('theme')
  const theme: LogoTheme | null = themeParam === 'light' || themeParam === 'dark' ? themeParam : null
  const wanted = params.get('type') as LogoType | null
  const types = [wanted && LOGO_TYPES.includes(wanted) ? wanted : 'logo', ...LOGO_TYPES].filter(
    (t, i, a) => a.indexOf(t) === i,
  ) as LogoType[]

  // Prefer higher-res logo/symbol/icon variants (same id + token), then fall
  // back to the original icon url as-is (lettermark fallback → always an image).
  const candidates = [...types.map((t) => cdnUrl(parsed.id, t, theme, parsed.token)), rawIcon]

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
      return NextResponse.json({ ok: true, dataUrl, id: parsed.id })
    }
    return NextResponse.json(
      {
        error:
          'no logo image returned for this brand' +
          (lastCt && !lastCt.startsWith('image/') ? ` (Brandfetch served "${lastCt}")` : ''),
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
