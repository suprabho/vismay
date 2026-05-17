import type mapboxgl from 'mapbox-gl'
import type { LayerOverride, MapPalette } from './storyConfig.types'

/**
 * Resolve a `LayerOverride` into a visibility flag and an optional color.
 *   undefined | false → hide (visibility: none)
 *   true              → show with the base style's own color
 *   string            → show with that color override
 */
function resolveOverride(value: LayerOverride | undefined): {
  visible: boolean
  color: string | null
} {
  if (value === undefined || value === false) return { visible: false, color: null }
  if (value === true) return { visible: true, color: null }
  return { visible: true, color: value }
}

// ─── Label category matchers (Mapbox standard style id conventions) ───
function isPlaceLabel(id: string): boolean {
  return (
    id.startsWith('country-label') ||
    id.startsWith('state-label') ||
    id.startsWith('settlement-') ||
    id.startsWith('place-label') ||
    id.startsWith('continent-label')
  )
}
function isRoadLabel(id: string): boolean {
  return (
    id.startsWith('road-label') ||
    id.startsWith('road-number') ||
    id.startsWith('road-intersection') ||
    id.startsWith('road-shield')
  )
}
function isTransitLabel(id: string): boolean {
  return id.startsWith('transit-')
}
function isPoiLabel(id: string): boolean {
  return id.startsWith('poi-label') || id.startsWith('airport-label')
}

// ─── Road line categorisation ─────────────────────────────────────────
function isRoadLineLayer(id: string): boolean {
  if (id.includes('label')) return false
  return id.startsWith('road-') || id.startsWith('tunnel-') || id.startsWith('bridge-')
}
function roadClass(id: string): 'motorway' | 'trunk' | 'pedestrian' | 'minor' {
  if (id.includes('-motorway')) return 'motorway'
  if (id.includes('-trunk')) return 'trunk'
  if (
    id.includes('-pedestrian') ||
    id.includes('-path') ||
    id.includes('-footway') ||
    id.includes('-steps')
  ) {
    return 'pedestrian'
  }
  return 'minor'
}

/**
 * Walk the active style's layers and rewrite paint + visibility properties so
 * the map matches a per-story palette. Operates on whatever Mapbox style is
 * loaded — built for `mapbox://styles/mapbox/dark-v11` but id matching is
 * permissive enough to cover Light v11, Streets v12, etc.
 *
 * Color fields (land/water/border/labelText/labelHalo/building) recolor
 * matching layers when set; unset keeps the base style's color.
 *
 * Label + road category fields (placeLabels / roadLabels / transitLabels /
 * poiLabels / motorways / trunkRoads / minorRoads / pedestrianPaths) default
 * to **hidden**. Each field accepts:
 *   true            → show with the base style's own color
 *   string (color)  → show and retint
 *   false/undefined → hide (visibility: none)
 *
 * Call this inside the map's `load` event. Calling before load throws
 * "Style is not done loading".
 */
export function applyMapPalette(map: mapboxgl.Map, palette: MapPalette): void {
  const style = map.getStyle()
  const layers = style?.layers ?? []

  const placeOpt = resolveOverride(palette.placeLabels)
  const roadLabelOpt = resolveOverride(palette.roadLabels)
  const transitOpt = resolveOverride(palette.transitLabels)
  const poiOpt = resolveOverride(palette.poiLabels)

  const motorwayOpt = resolveOverride(palette.motorways)
  const trunkOpt = resolveOverride(palette.trunkRoads)
  const minorOpt = resolveOverride(palette.minorRoads)
  const pedestrianOpt = resolveOverride(palette.pedestrianPaths)

  for (const layer of layers) {
    const id = layer.id
    const type = layer.type

    // Base (land/background)
    if (palette.land) {
      if (type === 'background') {
        map.setPaintProperty(id, 'background-color', palette.land)
      } else if (type === 'fill' && (id === 'land' || id === 'landcover' || id.startsWith('land-'))) {
        map.setPaintProperty(id, 'fill-color', palette.land)
      }
    }

    // Water fills
    if (palette.water && type === 'fill' && (id === 'water' || id.startsWith('water') || id.startsWith('waterway'))) {
      map.setPaintProperty(id, 'fill-color', palette.water)
    }

    // Admin borders (skip `-disputed` so dashed boundaries keep base style)
    if (palette.border && type === 'line' && id.includes('admin-') && id.includes('-boundary')) {
      map.setPaintProperty(id, 'line-color', palette.border)
    }

    // Buildings (2D fill + 3D extrusion)
    if (palette.building && id.includes('building')) {
      if (type === 'fill') map.setPaintProperty(id, 'fill-color', palette.building)
      else if (type === 'fill-extrusion') map.setPaintProperty(id, 'fill-extrusion-color', palette.building)
    }

    // Road lines — hidden by default, per-class opt-in
    if (type === 'line' && isRoadLineLayer(id)) {
      const cls = roadClass(id)
      const opt =
        cls === 'motorway' ? motorwayOpt :
        cls === 'trunk' ? trunkOpt :
        cls === 'pedestrian' ? pedestrianOpt :
        minorOpt
      map.setLayoutProperty(id, 'visibility', opt.visible ? 'visible' : 'none')
      if (opt.visible && opt.color) {
        map.setPaintProperty(id, 'line-color', opt.color)
      }
    }

    // Symbol labels — 4 categories hidden by default; other labels (water,
    // nature, airport codes, etc.) are untouched by visibility and just
    // pick up labelText/labelHalo.
    if (type === 'symbol') {
      const layout = (layer.layout ?? {}) as { 'text-field'?: unknown }
      if (layout['text-field'] == null) continue

      let categoryOpt: ReturnType<typeof resolveOverride> | null = null
      if (isPlaceLabel(id)) categoryOpt = placeOpt
      else if (isRoadLabel(id)) categoryOpt = roadLabelOpt
      else if (isTransitLabel(id)) categoryOpt = transitOpt
      else if (isPoiLabel(id)) categoryOpt = poiOpt

      if (categoryOpt) {
        map.setLayoutProperty(id, 'visibility', categoryOpt.visible ? 'visible' : 'none')
        if (categoryOpt.visible) {
          // Category color wins over the palette-wide labelText fallback.
          const color = categoryOpt.color ?? palette.labelText ?? null
          if (color) map.setPaintProperty(id, 'text-color', color)
          if (palette.labelHalo) map.setPaintProperty(id, 'text-halo-color', palette.labelHalo)
        }
      } else {
        if (palette.labelText) map.setPaintProperty(id, 'text-color', palette.labelText)
        if (palette.labelHalo) map.setPaintProperty(id, 'text-halo-color', palette.labelHalo)
      }
    }
  }
}

/**
 * Apply a custom Mapbox fontstack to every text layer. The fontstack must
 * reference fonts served by the style's `glyphs:` URL — typically custom
 * fonts uploaded to your Mapbox Studio account (e.g. a Vizmaya brand font).
 *
 * Passing a fontstack whose glyphs aren't available silently falls back to
 * the first font Mapbox can resolve, so test on a map that actually loads
 * from your tenant before relying on it.
 */
export function applyMapFontstack(map: mapboxgl.Map, fontstack: string[]): void {
  if (fontstack.length === 0) return
  const layers = map.getStyle()?.layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    const layout = (layer.layout ?? {}) as { 'text-field'?: unknown }
    if (layout['text-field'] == null) continue
    map.setLayoutProperty(layer.id, 'text-font', fontstack)
  }
}
