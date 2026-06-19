'use client'

import type { ReactNode, Ref } from 'react'
import { getVizModule } from '@vismay/viz-engine'
import type { ComposerHost } from './ComposerHost'
import type { ComposerState } from './types'
import { LayerView } from './LayerView'

/**
 * Builds the foreground body (the visible layers, arranged per the host's
 * `arrangement` mode) and hands it to `host.renderFrame`, which wraps it in the
 * surface's chrome (frame, background, data provider, capture root). The preview
 * node the frame returns IS the export node (preview == export).
 */
export function PreviewPane<TCtx>({
  host,
  state,
  ctx,
  captureRef,
}: {
  host: ComposerHost<TCtx>
  state: ComposerState
  ctx: TCtx
  captureRef?: Ref<HTMLDivElement>
}) {
  // `overlay`-placement layers (badges) float over the whole card — the host
  // renders those at card level via `renderFrame`, so they're excluded from the
  // in-flow stack here.
  const visible = state.layers.filter(
    (l) => l.visible && getVizModule(l.layer.type)?.placement !== 'overlay',
  )

  let body: ReactNode
  if (host.arrangement === 'stack') {
    // Vertical stack: each layer takes an equal slice (a positioned wrapper so a
    // bleed layer's `absolute inset-0` stays inside its slot). Per-layer weight
    // is a later refinement.
    body = (
      <div className="flex h-full min-h-0 flex-col">
        {visible.map((l) => (
          <div key={l.id} className="relative min-h-0 flex-1">
            <LayerView layer={l.layer} />
          </div>
        ))}
      </div>
    )
  } else {
    // regions / free arrangement render flat for now (m3 / m4 specialise these).
    body = visible.map((l) => <LayerView key={l.id} layer={l.layer} />)
  }

  return <>{host.renderFrame({ state, ctx, body, captureRef })}</>
}
