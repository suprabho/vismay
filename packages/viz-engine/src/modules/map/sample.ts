import type { MapLayerConfig } from './index'

/**
 * Catalog-only sample fixture. Requires `NEXT_PUBLIC_MAPBOX_TOKEN` at runtime;
 * without it the catalog falls back to a chip.
 */
export const sample: MapLayerConfig = {
  type: 'map',
  center: [-74.0, 40.71],
  zoom: 3,
  pitch: 0,
  bearing: 0,
}
