import type {
  StorySectionConfig,
  VizLayer,
  ForegroundSlotInput,
  ForegroundRegionsInput,
  ForegroundRegionDef,
  BackgroundSlotInput,
} from './storyConfig.types'
import type { ForegroundLayoutDef, ForegroundLayoutRegion } from '../types'

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
  | {
      kind: 'regions'
      layout: string
      regions: Record<string, VizLayer[]>
      /**
       * A layout def synthesized from inline region `style`s (approach 3). When
       * present, `ForegroundLayoutSlot` uses it directly instead of looking
       * `layout` up in the registry.
       */
      inlineDef?: ForegroundLayoutDef
    }

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
  // `layout` is optional (inline-region form omits it), so discriminate on
  // `regions` — but a `map` VizLayer also carries a `regions` field, so exclude
  // anything that looks like a layer (`type`).
  return (
    !Array.isArray(input) &&
    typeof input === 'object' &&
    input != null &&
    'regions' in input &&
    !('type' in input)
  )
}

/** A region value that carries its own geometry (`{ style, layers }`) vs. bare layers. */
function isRegionDef(v: VizLayer | VizLayer[] | ForegroundRegionDef): v is ForegroundRegionDef {
  return (
    !Array.isArray(v) &&
    typeof v === 'object' &&
    v != null &&
    'layers' in v &&
    !('type' in v)
  )
}

function resolveForeground(section: StorySectionConfig): ResolvedForeground {
  const fg = section.foreground
  if (fg !== undefined) {
    if (isRegionsInput(fg)) {
      const regions: Record<string, VizLayer[]> = {}
      const inlineStyles: Record<string, ForegroundLayoutRegion> = {}
      let hasInline = false
      for (const [key, val] of Object.entries(fg.regions)) {
        if (isRegionDef(val)) {
          regions[key] = asLayerArray(val.layers)
          inlineStyles[key] = { style: val.style }
          hasInline = true
        } else {
          regions[key] = asLayerArray(val)
        }
      }
      let inlineDef: ForegroundLayoutDef | undefined
      if (hasInline) {
        // Any region declared without an inline style still needs a box so its
        // layers aren't dropped — give it a full fill.
        const defRegions: Record<string, ForegroundLayoutRegion> = {}
        for (const key of Object.keys(regions)) {
          defRegions[key] = inlineStyles[key] ?? { style: { position: 'absolute', inset: 0 } }
        }
        inlineDef = { name: fg.layout ?? 'inline', regions: defRegions, stackOnPortrait: true }
      }
      return { kind: 'regions', layout: fg.layout ?? '', regions, inlineDef }
    }
    // Deck-format sugar: `section.layout` at the root paired with a flat
    // `foreground:` array becomes a region-aware foreground using a single
    // `default` region. Deck layouts are registered as single-fill containers
    // (foregroundLayouts.ts) because their vizslots self-position via
    // `style.position` + `style.size`. The layout name is preserved so the
    // admin form / preview can render the right scaffolding and downstream
    // consumers (telemetry, layout-aware selectors) can detect deck slides.
    const layers = asLayerArray(fg as VizLayer | VizLayer[])
    if (typeof section.layout === 'string' && section.layout.trim().length > 0) {
      return { kind: 'regions', layout: section.layout, regions: { default: layers } }
    }
    return { kind: 'flat', layers }
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

/**
 * Foreground layer-type classification for the SHARE-CARD builders — it decides
 * which layers become a "stat" card vs. a "chart" card. (The live deck stack
 * sizes layers via `ForegroundVizSlot`'s separate `STACK_VISUAL_TYPES`; the two
 * sets serve different jobs and intentionally diverge — e.g. a `table` self-
 * sizes in the live stack but is the section's *graphic* on a share card.)
 *
 *   • `prose`  — copy layers (`text` / `bodyText`) carried by the separate
 *     text card; dropped from the visual / graph cards.
 *   • `lead`   — the small set of self-sizing text callouts (`bigStat`,
 *     `keyValue`, `quote`) that pair with a graphic on the deck slide.
 *   • `visual` — EVERYTHING ELSE: the section's graphic (chart, image, table,
 *     video, map, 3D viewer, and every vertical module — `fs:*`, `f1:*`, …).
 *     Classified by exclusion so a new vertical graphic defaults to "visual"
 *     (its own chart card) without having to be enumerated here.
 */
export const FOREGROUND_PROSE_TYPES: ReadonlySet<string> = new Set(['text', 'bodyText'])

/** Self-sizing text callouts — the only foreground types that are NOT graphics. */
export const FOREGROUND_LEAD_TYPES: ReadonlySet<string> = new Set([
  'bigStat',
  'keyValue',
  'quote',
])

/**
 * A foreground layer is a "visual" (the section's graphic, eligible for its own
 * chart share card) when it is neither prose nor a self-sizing lead callout.
 */
export function isForegroundVisualType(type: string): boolean {
  return !FOREGROUND_PROSE_TYPES.has(type) && !FOREGROUND_LEAD_TYPES.has(type)
}

/**
 * Back-compat alias: the explicit core graphic types. Prefer
 * {@link isForegroundVisualType} — it also covers `table`, `video`, and every
 * vertical module by exclusion, which a static set cannot.
 */
export const FOREGROUND_VISUAL_TYPES: ReadonlySet<string> = new Set([
  'chart',
  'image',
  'imageGrid',
  'mapbox',
  'map',
  'embed',
  'rive',
  'video',
  'starship:viewer',
])

export interface ClassifiedForegroundLayers {
  /** Self-sizing callouts: `bigStat`, `keyValue`, `quote`. */
  lead: VizLayer[]
  /** Chart-like graphics that fill or stack as the card's visual. */
  visual: VizLayer[]
  /** Prose carried by the separate text card. */
  prose: VizLayer[]
}

export function classifyForegroundLayers(layers: VizLayer[]): ClassifiedForegroundLayers {
  const lead: VizLayer[] = []
  const visual: VizLayer[] = []
  const prose: VizLayer[] = []
  for (const l of layers) {
    if (FOREGROUND_PROSE_TYPES.has(l.type)) prose.push(l)
    else if (FOREGROUND_LEAD_TYPES.has(l.type)) lead.push(l)
    else visual.push(l)
  }
  return { lead, visual, prose }
}
