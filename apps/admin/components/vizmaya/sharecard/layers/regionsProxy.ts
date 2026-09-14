import type { MapRegionLayer } from '@vismay/viz-engine'
import { vizmayaPublicUrl } from '@/lib/publicSite'

const PROXY_PATH = '/api/vizmaya/share-cards/proxy-data'

/** Root-relative path of a geojsonUrl that lives on the vizmaya public site,
 *  or null when it's something else (already proxied, third-party, data:). */
function publicSitePath(url: string): string | null {
  if (url.startsWith(PROXY_PATH)) return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const u = new URL(url)
    const pub = new URL(vizmayaPublicUrl)
    const host = (h: string) => h.replace(/^www\./, '')
    if (host(u.hostname) === host(pub.hostname)) return `${u.pathname}${u.search}`
  } catch {
    /* relative-without-slash or garbage: leave untouched */
  }
  return null
}

/**
 * Rewrite a custom region layer's `geojsonUrl` so it loads on the admin
 * origin. Story configs point at files under vizmaya.fyi's `/public`
 * (`/data/x.geojson`); the engine fetches that URL verbatim, which 404s from
 * the admin host. Route it through the same-origin proxy instead. Returns the
 * input object unchanged (same identity) when there is nothing to rewrite, so
 * memoized consumers don't re-apply the layer.
 */
export function proxyRegionsGeojson(regions: MapRegionLayer | undefined): MapRegionLayer | undefined {
  if (!regions || regions.level !== 'custom' || !regions.geojsonUrl) return regions
  const path = publicSitePath(regions.geojsonUrl)
  if (!path) return regions
  return { ...regions, geojsonUrl: `${PROXY_PATH}?path=${encodeURIComponent(path)}` }
}
