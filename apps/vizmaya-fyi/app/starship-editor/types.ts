/**
 * Per-part overrides edited live in `/starship-editor`.
 *
 * The editor mutates the loaded GLB's named meshes (e.g. cone/tank/raptor
 * for Starship, or `First Stage` / `Second Stage` etc. for Falcon 9) via
 * direct three.js writes in `useFrame`. This state is the source of truth
 * for "what would I have to do to the import script to bake this in?".
 *
 * Part keys are model-dependent — we use the same string as the GLB node
 * name. `Overrides` is just `Record<string, PartOverride>` so the editor
 * can adapt to whatever rocket is loaded.
 */

import type { RocketModel } from '@vismay/starship-viz/types'

export interface PartOverride {
  visible: boolean
  positionOffset: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scaleMultiplier: number
  /** Per-part material override. `null` falls back to the global setting. */
  materialOverride: MaterialVariant | null
}

export type MaterialVariant = 'metal' | 'black' | 'normal' | 'wireframe'

export const defaultPartOverride = (): PartOverride => ({
  visible: true,
  positionOffset: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scaleMultiplier: 1,
  materialOverride: null,
})

export type Overrides = Record<string, PartOverride>

export const buildDefaultOverrides = (partNames: readonly string[]): Overrides => {
  const out: Overrides = {}
  for (const name of partNames) out[name] = defaultPartOverride()
  return out
}

export interface EditorState {
  /** Which rocket the scene is currently loading. */
  model: RocketModel
  /** Currently selected part for the inspector panel. */
  selected: string | null
  /** When non-null, only the named part is visible (visibility toggles ignored). */
  solo: string | null
  overrides: Overrides
  /** Global material variant. Ignored for parts whose own material is
   * preserved (e.g. Falcon 9 keeps its Sketchfab-authored textures). */
  globalMaterial: MaterialVariant
  /** Show drei AxesHelper at origin (R/G/B = X/Y/Z, 2-unit length). */
  showAxes: boolean
  /** Show a 10×10 grid on the XZ plane. */
  showGrid: boolean
  /** Show per-part Box3Helper outlining each part's world-space bounding box. */
  showBoxes: boolean
  /** Show a wireframe overlay on every visible mesh. */
  showWireframe: boolean
}

export const defaultEditorState = (
  model: RocketModel,
  partNames: readonly string[],
): EditorState => ({
  model,
  selected: partNames[0] ?? null,
  solo: null,
  overrides: buildDefaultOverrides(partNames),
  globalMaterial: 'metal',
  showAxes: true,
  showGrid: true,
  showBoxes: false,
  showWireframe: false,
})
