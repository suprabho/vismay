import type {
  StorySectionConfig,
  VizLayer,
  ForegroundSlotInput,
  ForegroundRegionsInput,
  BackgroundSlotInput,
} from './storyConfig.types'

/**
 * Back-compat shim. Translates a section's legacy `chart:` and `map:` fields
 * (and explicit `foreground:` / `background:` declarations) into the
 * resolved shapes consumed by the slot dispatchers.
 *
 * Phase 1 (current): foreground resolves to either a flat layer array (the
 * legacy case) or an explicit region map (when the section opts in to the
 * region shape). The legacy text card is still rendered out-of-band by
 * `MapStorySection`, so the shim does NOT synthesize a text layer here —
 * that comes in Phase 2 alongside the text module.
 *
 * Returns derived views only — the shim does NOT mutate the section.
 */

export type ResolvedForeground =
  | { kind: 'flat'; layers: VizLayer[] }
  | { kind: 'regions'; layout: string; regions: Record<string, VizLayer[]> }

export type ResolvedLayers = {
  /** Region-aware foreground description. */
  foreground: ResolvedForeground
  /** Always an array. Length 0 means "background slot suppressed" (e.g. `{ type: 'none' }`). */
  background: VizLayer[]
}

/**
 * Flat back-compat shape. Mirrors the pre-region return contract so existing
 * consumers (PDF shells, share-card renderers, the legacy text-card position
 * gate in MapStorySection) keep working without learning about regions.
 *
 * For `kind: 'regions'` foregrounds, region arrays are concatenated in
 * Object.values iteration order — which is insertion order for plain
 * objects. Authors should declare regions in their intended document order
 * if a flat consumer needs predictable layer ordering.
 */
export type ResolvedLayersFlat = {
  foreground: VizLayer[]
  background: VizLayer[]
}

function asLayerArray(input: VizLayer | VizLayer[] | undefined): VizLayer[] {
  if (input == null) return []
  return Array.isArray(input) ? input : [input]
}

function asBackgroundArray(input: BackgroundSlotInput | undefined): VizLayer[] {
  if (input == null) return []
  if (Array.isArray(input)) return input
  if (typeof input === 'object' && 'type' in input && input.type === 'none') return []
  return [input as VizLayer]
}

function isRegionsInput(input: ForegroundSlotInput): input is ForegroundRegionsInput {
  return (
    !Array.isArray(input) &&
    typeof input === 'object' &&
    input != null &&
    'layout' in input &&
    'regions' in input
  )
}

function resolveForeground(section: StorySectionConfig): ResolvedForeground {
  const fg = section.foreground
  if (fg !== undefined) {
    if (isRegionsInput(fg)) {
      const regions: Record<string, VizLayer[]> = {}
      for (const [key, val] of Object.entries(fg.regions)) {
        regions[key] = asLayerArray(val)
      }
      return { kind: 'regions', layout: fg.layout, regions }
    }
    return { kind: 'flat', layers: asLayerArray(fg as VizLayer | VizLayer[]) }
  }
  if (typeof section.chart === 'string' && section.chart.trim().length > 0) {
    return { kind: 'flat', layers: [{ type: 'chart', id: section.chart }] }
  }
  return { kind: 'flat', layers: [] }
}

export function resolveSlots(section: StorySectionConfig): ResolvedLayers {
  const foreground = resolveForeground(section)
  const background: VizLayer[] = (() => {
    if (section.background !== undefined) return asBackgroundArray(section.background)
    // Every legacy section carries a top-level `map` block — synthesize a single map layer.
    if (section.map && Array.isArray(section.map.center)) {
      return [{ type: 'map', ...section.map }]
    }
    return []
  })()
  return { foreground, background }
}

/**
 * Back-compat helper for consumers that still expect a flat `VizLayer[]`.
 * Equivalent to the pre-region return shape of `resolveSlots()`.
 */
export function resolveSlotsFlat(section: StorySectionConfig): ResolvedLayersFlat {
  const r = resolveSlots(section)
  const foreground =
    r.foreground.kind === 'flat'
      ? r.foreground.layers
      : Object.values(r.foreground.regions).flat()
  return { foreground, background: r.background }
}
