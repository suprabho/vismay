import type { VizModule } from '../../types'
import type { StorySectionConfig } from '../../lib/storyConfig.types'

/**
 * The map layer's config mirrors today's `StorySectionConfig['map']` shape so
 * the back-compat shim (Phase 1) can synthesize a map layer from a section's
 * top-level `map:` field by structural copy.
 */
export type MapLayerConfig = { type: 'map' } & StorySectionConfig['map']

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MapLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: map layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.center) || r.center.length !== 2 || !r.center.every((n) => typeof n === 'number')) {
    throw new Error(`${ctx.label}: map layer requires 'center' (a [lng, lat] tuple)`)
  }
  if (typeof r.zoom !== 'number') {
    throw new Error(`${ctx.label}: map layer requires 'zoom' (number)`)
  }
  // Other fields (pitch, bearing, pins, regions, heatmap, textLabels, mobile) are
  // shape-validated downstream by MapboxBackground; surfacing them here would
  // duplicate the existing assertions in lib/storyConfig.ts without payoff.
  return { type: 'map', ...(r as Omit<MapLayerConfig, 'type'>) }
}

const mapModule: VizModule<MapLayerConfig> = {
  type: 'map',
  label: 'Map',
  slots: ['background', 'foreground'],
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
