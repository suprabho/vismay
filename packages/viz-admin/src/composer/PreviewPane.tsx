'use client'

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
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
  const fitRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = fitRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
    // Scale the natural-size card to fill the measured preview area.
    const cardSz = host.cardSize?.(ctx) ?? { w: 360, h: 360 }
    const fit = box.w > 0 && box.h > 0 ? Math.min(box.w / cardSz.w, box.h / cardSz.h) : 1
    const scale = Math.max(0.1, Math.min(fit, 4))
    return (
      <div ref={fitRef} className="flex h-full w-full items-center justify-center overflow-hidden">
        <div className="relative" style={{ width: cardSz.w * scale, height: cardSz.h * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{frame}</div>
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
