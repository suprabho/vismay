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
  aiSchema:
    `Accepted fields (a field marked (required) must be present; omit optional ` +
    `fields you don't need):\n` +
    `  - center: [number, number] (required) — [longitude, latitude]\n` +
    `  - zoom: number (required)\n` +
    `  - pitch: number — camera tilt in degrees (0 = top-down, default 0)\n` +
    `  - bearing: number — camera rotation in degrees (default 0)\n` +
    `  - pins: a list of { coordinates: [lng, lat], label?, color?, radius? }\n` +
    `  - (advanced overlays — regions, heatmap, textLabels — exist; omit unless asked)\n\n` +
    `Example shape:\n` +
    `type: map\n` +
    `center: [-80.604, 28.608]\n` +
    `zoom: 6\n` +
    `pitch: 45\n` +
    `pins:\n` +
    `  - { coordinates: [-80.604, 28.608], label: "Cape Canaveral" }`,
}

export default mapModule
