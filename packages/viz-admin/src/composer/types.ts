import type { VizLayer } from '@vismay/viz-engine'
import type { TransformLike } from './transform'

/**
 * A layer as the composer shell manipulates it: the engine `VizLayer` (module
 * `type` + config + optional `style`) plus the editor-only bookkeeping every
 * surface needs. In `free` arrangement each layer carries a `transform` (center
 * position + size + rotation + opacity); `stack` / `regions` ignore it.
 */
export interface ComposerLayer {
  /** Stable editor id — distinct from the layer's module `type`. */
  id: string
  /** The engine layer rendered through the viz-engine registry. */
  layer: VizLayer
  name: string
  visible: boolean
  locked?: boolean
  /** `regions` mode only — which layout region this layer is slotted into. */
  region?: string
  /** `free` mode — the layer's position / size / rotation / opacity. */
  transform?: TransformLike
}

/** What the config panel is currently editing. */
export type ComposerSelection =
  | { kind: 'layer'; id: string }
  | { kind: 'background' }
  | null

/** The full editor state the shell operates on. Each host's adapter projects
 *  this to/from its own persisted snapshot. */
export interface ComposerState {
  layers: ComposerLayer[]
  /** Single background layer (or none). */
  background: VizLayer | null
  /** Active layout name in `regions` mode; ignored otherwise. */
  layout?: string
}

/**
 * How layers are arranged on the surface:
 * - `stack`  — ordered vertical flow (footshorts share cards)
 * - `regions`— layout + named regions (vizmaya story sections)
 * - `free`   — absolute free-transform (vizmaya share cards)
 */
export type ArrangementMode = 'stack' | 'regions' | 'free'
