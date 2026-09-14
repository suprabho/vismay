import { isAuthed } from '@/lib/adminAuth'
import { vizmayaPublicUrl } from '@/lib/publicSite'

/**
 * Same-origin proxy for story data files served from vizmaya.fyi's `/public`
 * (custom choropleth GeoJSON via `regions.geojsonUrl: "/data/x.geojson"`).
 * Story configs reference these as root-relative paths that resolve on the
 * consumer site; the share-card composer runs on the admin origin, where
 * `fetch('/data/x.geojson')` 404s and the regions silently never draw. This
 * route fetches the file from the public site server-side (following the
 * apex→www redirect, which has no CORS headers) and returns it same-origin.
 *
 * Only root-relative paths are accepted (`?path=/data/x.geojson`) — never an
 * arbitrary URL — so this is not an open proxy. JSON-ish responses only.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JSON_TYPES = ['application/json', 'application/geo+json', 'text/plain']

export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response('unauthorized', { status: 401 })
  const path = new URL(req.url).searchParams.get('path')
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('..')) {
    return new Response('bad path', { status: 400 })
  }

  try {
    const upstream = await fetch(`${vizmayaPublicUrl}${path}`, {
      redirect: 'follow',
      headers: { accept: 'application/geo+json, application/json;q=0.9, */*;q=0.1' },
    })
    if (!upstream.ok) return new Response(`upstream ${upstream.status}`, { status: 502 })
    const contentType = upstream.headers.get('content-type') ?? 'application/json'
    if (!JSON_TYPES.some((t) => contentType.startsWith(t))) {
      return new Response('not a data file', { status: 415 })
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
    return new Response(`fetch failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
  }
}
