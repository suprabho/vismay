import type { ReactNode, Ref } from 'react'
import type { VizLayer } from '@vismay/viz-engine'
import type { ArrangementMode, ComposerLayer, ComposerState } from './types'

/** A choice in the background picker. `make` builds the background VizLayer (or
 *  null for "none") when selected. */
export interface BackgroundOption {
  id: string
  label: string
  make: (ctx: unknown) => VizLayer | null
}

/**
 * The single seam that makes `LayerComposer` surface-agnostic. Footshorts share
 * cards (`stack`), vizmaya story sections (`regions`), and vizmaya share cards
 * (`free`) each implement this; the shell itself holds no domain logic — it
 * operates on `ComposerState` + this adapter + a per-render `ctx`.
 *
 * Persistence and export stay with the surface (outside the shell) for now; they
 * move onto this interface when a second surface needs the shell to drive them.
 */
export interface ComposerHost<TCtx = unknown> {
  /** Stable id (telemetry + picker-registry namespacing). */
  id: string
  arrangement: ArrangementMode

  /** Registry subset offered in the add-layer picker. The shell intersects this
   *  with `listModulesForSlot('foreground')`. Receives `ctx` so a surface can
   *  vary the set (e.g. by story vertical). */
  allowedModuleTypes: (ctx: TCtx) => string[]

  /** Construct a fresh `ComposerLayer` for a newly added module type (default
   *  config + name + style/region). */
  makeLayer: (type: string, ctx: TCtx) => ComposerLayer

  /** Options for the background picker in the config panel. */
  backgroundOptions: (ctx: TCtx) => BackgroundOption[]

  /** `regions` mode only — which registered layouts the surface offers. Region
   *  names + their `accepts` allowlists come from the layout def itself. */
  allowedLayouts?: (ctx: TCtx) => string[]

  /** Wrap the shell-built preview body (background + foreground slots) in the
   *  surface's frame/chrome (header/footer, aspect box, theme vars). The host
   *  sizes the frame and threads the capture root ref for PNG export. */
  renderFrame: (args: {
    state: ComposerState
    ctx: TCtx
    body: ReactNode
    captureRef?: Ref<HTMLDivElement>
  }) => ReactNode
}
