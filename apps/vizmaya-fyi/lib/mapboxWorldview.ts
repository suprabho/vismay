import type mapboxgl from 'mapbox-gl'

// Mapbox `country-boundaries-v1` only ships separate worldview-keyed polygons
// for these countries; everything else has a single `worldview: "all"` feature.
// Docs: https://docs.mapbox.com/data/tilesets/reference/mapbox-countries-v1/
const SUPPORTED_WORLDVIEWS = new Set(['AR', 'CN', 'IN', 'JP', 'MA', 'RU', 'TR', 'US'])

type Filter = unknown[]

/**
 * Filter for `country-boundaries-v1` that picks the country polygon valid in
 * the given worldview. For IN this returns the polygon with PoK + Aksai Chin
 * inside India and full Arunachal Pradesh — the rendering required for Indian
 * audiences. Falls back to a plain ISO match for countries Mapbox doesn't ship
 * a separate worldview for.
 */
export function buildCountryFilter(iso: string, worldview = iso): Filter {
  const country = iso.toUpperCase()
  const view = worldview.toUpperCase()
  if (!SUPPORTED_WORLDVIEWS.has(view)) {
    return ['==', ['get', 'iso_3166_1'], country]
  }
  return [
    'all',
    ['==', ['get', 'iso_3166_1'], country],
    [
      'any',
      ['==', ['get', 'worldview'], 'all'],
      ['in', view, ['get', 'worldview']],
    ],
  ]
}

function rewriteWorldview(expr: unknown, worldview: string): unknown {
  if (!Array.isArray(expr)) return expr
  if (
    expr.length >= 3 &&
    expr[0] === 'match' &&
    Array.isArray(expr[1]) &&
    expr[1][0] === 'get' &&
    expr[1][1] === 'worldview'
  ) {
    const next = expr.slice()
    next[2] = ['all', worldview]
    return next
  }
  return expr.map((c) => rewriteWorldview(c, worldview))
}

/**
 * Mapbox v11 basemap styles bake `worldview = "US"` into every admin-* layer
 * filter, so the default rendering shows Aksai Chin and PoK outside India.
 * Walk those layers after style.load and rewrite the worldview match clause.
 * No-op for worldviews Mapbox doesn't ship.
 */
export function applyAdminWorldview(map: mapboxgl.Map, worldview: string) {
  const code = worldview.toUpperCase()
  if (!SUPPORTED_WORLDVIEWS.has(code)) return
  const layers = map.getStyle()?.layers ?? []
  for (const layer of layers) {
    if (!layer.id.startsWith('admin-')) continue
    const filter = (layer as { filter?: unknown }).filter
    if (!filter) continue
    const next = rewriteWorldview(filter, code)
    if (next === filter) continue
    try {
      map.setFilter(layer.id, next as mapboxgl.FilterSpecification)
    } catch {
      // Older custom styles may use stripped-down filters; skip silently.
    }
  }
}
