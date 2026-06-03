import { z } from 'zod'
import type { VizModule } from '../../types'
import type { StorySectionConfig } from '../../lib/storyConfig.types'
import { parseWithSchema } from '../../lib/zodConfig'

/**
 * The map layer's config mirrors today's `StorySectionConfig['map']` shape so
 * the back-compat shim can synthesize a map layer from a section's top-level
 * `map:` field by structural copy.
 */
export type MapLayerConfig = { type: 'map' } & StorySectionConfig['map']

/**
 * Zod schema for the `map` module. Only `center` + `zoom` are validated here;
 * every other camera/overlay field (pitch, bearing, pins, regions, heatmap,
 * textLabels, mobile, …) passes through untouched — they're shape-validated
 * downstream by MapboxBackground, and surfacing them here would duplicate those
 * assertions. `.passthrough()` preserves the legacy `{ type: 'map', ...r }`
 * behaviour exactly (extra keys, including `style`, are kept).
 */
export const mapSchema = z
  .object({
    type: z.literal('map'),
    center: z
      .array(z.number())
      .length(2)
      .describe('[longitude, latitude]. Required.'),
    zoom: z.number().describe('Camera zoom level. Required.'),
    pitch: z.number().optional().describe('Camera tilt in degrees (0 = top-down). Default 0.'),
    bearing: z.number().optional().describe('Camera rotation in degrees. Default 0.'),
    opacity: z.number().optional().describe('Map layer opacity 0–1. Defaults to the story map opacity.'),
    flySpeed: z.number().optional().describe('Fly-to animation speed for transitions into this section.'),
    pins: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe(
        'Map markers: [{ coordinates: [lng, lat], label?, color?, radius?, pulse?, labelAnchor? (top|bottom|left|right), image? }].',
      ),
    regions: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Choropleth overlay: { level: "country"|"custom", items: [{ code, value?, color?, opacity?, label? }], colors?: string[], ramp?: number[], lineColor?, labels?, legend? }.',
      ),
    heatmap: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Heatmap overlay: { points: [{ coordinates: [lng, lat], weight? }], radius?, ramp?: string[], opacity? }.',
      ),
    textLabels: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe(
        'Free-floating labels (no pin): [{ coordinates: [lng, lat], text, color?, anchor? (top|bottom|left|right), size? }].',
      ),
    mobile: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Portrait/mobile camera overrides — the same map fields (center?, zoom?, pitch?, bearing?, pins?, regions?, heatmap?, textLabels?).',
      ),
  })
  .passthrough()

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MapLayerConfig {
  return parseWithSchema(mapSchema, raw, ctx) as MapLayerConfig
}

const mapModule: VizModule<MapLayerConfig> = {
  type: 'map',
  label: 'Map',
  slots: ['background', 'foreground'],
  schema: mapSchema,
  parseConfig,
  load: () => import('./Component'),
  loadPersistent: () => import('./PersistentComponent'),
  // `persistent-aggregated` is the BackgroundVizSlot mounting strategy: ONE
  // Mapbox WebGL context for the whole story, every unit's config in one
  // array. ForegroundVizSlot ignores this flag and uses per-unit `load` —
  // foreground maps own their own WebGL context (React reuses the instance
  // across units via `stableIdentity` keying, so a story with a single
  // foreground-region map still spins up exactly one context).
  mountingMode: 'persistent-aggregated',
  readinessProfile: 'tiles-then-settle',
  // The map instance is shared across every unit that references "a map" — the
  // identity is the slug-scoped persistent instance, not the per-unit config.
  // Both BackgroundVizSlot and ForegroundVizSlot use this to dedupe.
  stableIdentity: () => 'map:default',
  regionPreferences: ['lead'],
}

export default mapModule
