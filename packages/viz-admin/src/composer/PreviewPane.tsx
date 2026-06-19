'use client'

import type { ReactNode, Ref } from 'react'
import { getVizModule } from '@vismay/viz-engine'
import type { ComposerHost } from './ComposerHost'
import type { ComposerSelection, ComposerState } from './types'
import { LayerView } from './LayerView'
import { FreeTransformLayer } from './FreeTransformLayer'
import { DEFAULT_TRANSFORM, transformWrapperStyle } from './transform'

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
  selection,
  multiSel,
  onSelect,
  onToggleMulti,
  onChange,
}: {
  host: ComposerHost<TCtx>
  state: ComposerState
  ctx: TCtx
  captureRef?: Ref<HTMLDivElement>
  /** free-mode interaction (select / move / resize / rotate / group); omitted in
   *  other arrangements. */
  selection?: ComposerSelection
  multiSel?: string[]
  onSelect?: (sel: ComposerSelection) => void
  onToggleMulti?: (id: string) => void
  onChange?: (next: ComposerState) => void
}) {
  const visibleAll = state.layers.filter((l) => l.visible)

  let body: ReactNode
  if (host.arrangement === 'free') {
    // Free mode: every layer is absolutely positioned by its own transform
    // (center % + size + rotation + opacity). Data layers carry an explicit
    // height box; self-sized layers omit it.
    body = (
      <>
        {visibleAll.map((l) => (
          <div key={l.id} style={transformWrapperStyle(l.transform ?? DEFAULT_TRANSFORM, { sizeByWidth: true })}>
            <div className="relative h-full w-full overflow-hidden">
              <LayerView layer={l.layer} />
            </div>
          </div>
        ))}
      </>
    )
  } else if (host.arrangement === 'stack') {
    // Vertical stack: each layer takes an equal slice. `overlay`-placement layers
    // (badges) float over the card — the host renders those via renderFrame, so
    // they're excluded from the in-flow stack.
    const stackLayers = visibleAll.filter(
      (l) => getVizModule(l.layer.type)?.placement !== 'overlay',
    )
    body = (
      <div className="flex h-full min-h-0 flex-col">
        {stackLayers.map((l) => (
          <div key={l.id} className="relative min-h-0 flex-1">
            <LayerView layer={l.layer} />
          </div>
        ))}
      </div>
    )
  } else {
    // regions arrangement renders flat for now (m3 specialises this).
    body = visibleAll.map((l) => <LayerView key={l.id} layer={l.layer} />)
  }

  const frame = host.renderFrame({ state, ctx, body, captureRef })

  if (host.arrangement === 'free' && onSelect && onChange) {
    return (
      <div className="flex justify-center">
        <div className="relative inline-block">
          {frame}
          <FreeTransformLayer
            state={state}
            selection={selection ?? null}
            multiSel={multiSel ?? []}
            onSelect={onSelect}
            onToggleMulti={onToggleMulti ?? (() => {})}
            onChange={onChange}
          />
        </div>
      </div>
    )
  }

  return <div className="flex justify-center">{frame}</div>
}
