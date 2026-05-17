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
  slots: ['background'],
  parseConfig,
  load: () => import('./Component'),
  loadPersistent: () => import('./PersistentComponent'),
  mountingMode: 'persistent-aggregated',
  readinessProfile: 'tiles-then-settle',
  // The map instance is shared across every unit that references "a map" — the
  // identity is the slug-scoped persistent instance, not the per-unit config.
  // BackgroundVizSlot uses this to dedupe.
  stableIdentity: () => 'map:default',
}

export default mapModule
