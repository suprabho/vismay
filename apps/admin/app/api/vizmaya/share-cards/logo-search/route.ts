import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'

/**
 * Brand-name → logo search for the Vizmaya share-card composer.
 *
 * Thin server proxy over Brandfetch's Brand Search API
 * (https://docs.brandfetch.com/reference/brand-search-api):
 *
 *   GET https://api.brandfetch.io/v2/search/{name}?c={CLIENT_ID}
 *
 * Proxying (rather than calling from the browser) keeps the client id out of
 * the bundle and dodges CORS. The returned `icon` URLs are CDN thumbnails the
 * picker renders directly; the actual high-res logo a user picks is fetched and
 * base64-embedded by the sibling `logo-image` route so `html-to-image` can
 * rasterize it on capture without a cross-origin fetch.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BrandfetchHit {
  name?: string
  domain?: string
  icon?: string
  brandId?: string
  claimed?: boolean
}

export interface LogoSearchResult {
  name: string
  domain: string
  icon: string | null
  brandId: string | null
}

export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const clientId = process.env.BRANDFETCH_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'logo search unavailable — set BRANDFETCH_CLIENT_ID' },
      { status: 501 },
    )
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ ok: true, results: [] })
  }

  const url = `https://api.brandfetch.io/v2/search/${encodeURIComponent(q)}?c=${encodeURIComponent(clientId)}`
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `brandfetch search failed (${res.status})`, detail: detail.slice(0, 300) },
        { status: 502 },
      )
    }
    const hits = (await res.json()) as BrandfetchHit[]
    const results: LogoSearchResult[] = (Array.isArray(hits) ? hits : [])
      .filter((h) => typeof h.domain === 'string' && h.domain.length > 0)
      .map((h) => ({
        name: h.name?.trim() || (h.domain as string),
        domain: h.domain as string,
        icon: typeof h.icon === 'string' && h.icon ? h.icon : null,
        brandId: typeof h.brandId === 'string' ? h.brandId : null,
      }))
      .slice(0, 20)
    return NextResponse.json({ ok: true, results })
  } catch (e) {
    return NextResponse.json(
      { error: `brandfetch search failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
}
