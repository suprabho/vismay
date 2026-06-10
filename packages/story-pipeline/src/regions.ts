import type { RegionRequirement, RegionData } from './types'

/**
 * Theme-token ramp stops the renderer swaps for live CSS variables. A clean
 * low→high editorial ramp; the engine auto-fits the domain to the data's
 * [min, max] when no explicit `ramp` is supplied.
 */
const REGION_RAMP_COLORS = ['$surface', '$teal', '$accent']

/** Round a value for a legend endpoint without trailing noise (e.g. 31.96 → 32). */
function legendLabel(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
}

/**
 * Assemble a full `MapRegionLayer` (the engine's `map.regions` shape) from a
 * choropleth REQUIREMENT plus the grounded `{ code, value }` items produced by
 * `generateRegions`. Deterministic on purpose — the model emits only the
 * per-region values; the presentation (ramp colours, legend, geometry) is built
 * here so it can never drift or be fabricated. Mirrors `buildChartData`.
 */
export function buildRegionLayer(
  requirement: RegionRequirement,
  data: RegionData,
): Record<string, unknown> {
  const layer: Record<string, unknown> = {
    level: requirement.level,
    colors: REGION_RAMP_COLORS,
    lineWidth: 0.6,
    items: data.items,
  }
  // Custom GeoJSON needs the author-supplied geometry pointers; country level
  // uses Mapbox's built-in boundaries and needs neither.
  if (requirement.level === 'custom') {
    if (requirement.geojsonUrl) layer.geojsonUrl = requirement.geojsonUrl
    if (requirement.idProperty) layer.idProperty = requirement.idProperty
  }
  const values = data.items.map((i) => i.value).filter((v) => typeof v === 'number')
  if (values.length > 0) {
    layer.legend = {
      show: true,
      title: requirement.metric,
      lowLabel: legendLabel(Math.min(...values)),
      highLabel: legendLabel(Math.max(...values)),
      position: 'bottom-left',
    }
  }
  return layer
}
