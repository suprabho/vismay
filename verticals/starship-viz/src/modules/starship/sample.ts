import type { StarshipViewerConfig } from './index'

/**
 * Sample config used by the admin catalog and tests. Pairs the default
 * `metal` finish with the `rotate` showcase so a single screenshot conveys
 * what the module does.
 */
export const sample: StarshipViewerConfig = {
  type: 'starship:viewer',
  model: 'starship',
  mode: 'rotate',
  material: 'metal',
}
