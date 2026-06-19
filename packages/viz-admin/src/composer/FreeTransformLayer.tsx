'use client'

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { ComposerLayer, ComposerSelection } from './types'
import { DEFAULT_TRANSFORM, transformWrapperStyle } from './transform'

const clamp = (n: number) => Math.min(100, Math.max(0, n))

/**
 * The free-mode interaction overlay: a capture-excluded sibling laid exactly over
 * the card, with one selectable/draggable box per layer (matching the layer's
 * transform). Pointer position maps to card % via the overlay's own bounding
 * rect, so it works at any preview scale. Drag moves the layer center; Size /
 * Rotate / Opacity are edited from the TransformControls panel.
 */
export function FreeTransformLayer({
  layers,
  selection,
  onSelect,
  onTransform,
}: {
  layers: ComposerLayer[]
  selection: ComposerSelection
  onSelect: (sel: ComposerSelection) => void
  onTransform: (id: string, patch: { xPct: number; yPct: number }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)

  const onMove = useCallback(
    (e: PointerEvent) => {
      const id = dragId.current
      const el = containerRef.current
      if (!id || !el) return
      const rect = el.getBoundingClientRect()
      const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100)
      const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100)
      onTransform(id, { xPct, yPct })
    },
    [onTransform],
  )

  const onUp = useCallback(() => {
    dragId.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }, [onMove])

  const onDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      e.preventDefault()
      onSelect({ kind: 'layer', id })
      dragId.current = id
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onSelect, onMove, onUp],
  )

  return (
    <div ref={containerRef} className="absolute inset-0 z-40" data-share-ui="true">
      {layers.map((l) => {
        const sel = selection?.kind === 'layer' && selection.id === l.id
        return (
          <div
            key={l.id}
            onPointerDown={(e) => onDown(e, l.id)}
            style={transformWrapperStyle(l.transform ?? DEFAULT_TRANSFORM, { sizeByWidth: true })}
            className="cursor-move"
          >
            <div
              className={`h-full w-full rounded ${
                sel ? 'ring-2 ring-sky-400/90' : 'ring-1 ring-transparent hover:ring-white/30'
              }`}
            />
          </div>
        )
      })}
    </div>
  )
}
