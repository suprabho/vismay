import type { RiveLayerConfig } from './index'

/**
 * Public Rive sample — official "Vehicle" demo. If the asset URL ever 404s
 * the catalog renders a failure chip.
 */
export const sample: RiveLayerConfig = {
  type: 'rive',
  src: 'https://cdn.rive.app/animations/vehicles.riv',
  autoplay: true,
}
