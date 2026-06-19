'use client'

import { useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { ComposerLayer, ComposerSelection, ComposerState } from './types'
import { patchLayerTransform } from './mutations'
import { groupBBox, moveGroupBy, rotateGroupAround, scaleGroupAround } from './groupTransform'
import { DEFAULT_TRANSFORM, scaleTransformAround, type TransformLike } from './transform'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** corner index 0=TL 1=TR 2=BR 3=BL → handle CSS position + cursor. */
const CORNER_POS = [
  'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
]

type Target = { kind: 'layer'; id: string } | { kind: 'group'; id: string }

interface DragState {
  kind: 'move' | 'scale' | 'rotate'
  target: Target
  startState: ComposerState
  startT: TransformLike // single-layer start transform (unused for groups)
  sx: number
  sy: number
  pivotXPct?: number
  pivotYPct?: number
  startLen?: number
  centerX?: number
  centerY?: number
  a0?: number
}

/** Four corner positions (card %) of an axis-aligned box centered at (cx,cy). */
function corners(cx: number, cy: number, w: number, h: number): Array<[number, number]> {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ]
}

/**
 * Free-mode interaction overlay (capture-excluded sibling over the card):
 * - per-layer boxes select / move / (for the selected single layer) resize+rotate,
 * - shift/⌘-click an ungrouped layer toggles multi-select,
 * - clicking a grouped layer selects its GROUP; a selected group shows its bbox
 *   with corner + rotate handles that transform the whole group.
 * Gestures snapshot the state at pointer-down and recompute from it (no drift).
 */
export function FreeTransformLayer({
  state,
  selection,
  multiSel,
  onSelect,
  onToggleMulti,
  onChange,
}: {
  state: ComposerState
  selection: ComposerSelection
  multiSel: string[]
  onSelect: (sel: ComposerSelection) => void
  onToggleMulti: (id: string) => void
  onChange: (next: ComposerState) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current
      const el = containerRef.current
      if (!d || !el) return
      const rect = el.getBoundingClientRect()
      const rw = rect.width
      const rh = rect.height
      if (d.kind === 'move') {
        const dxPct = ((e.clientX - d.sx) / rw) * 100
        const dyPct = ((e.clientY - d.sy) / rh) * 100
        if (d.target.kind === 'group') {
          onChange(moveGroupBy(d.startState, d.target.id, dxPct, dyPct))
        } else {
          onChange(
            patchLayerTransform(d.startState, d.target.id, {
              xPct: clamp(d.startT.xPct + dxPct, 0, 100),
              yPct: clamp(d.startT.yPct + dyPct, 0, 100),
            }),
          )
        }
      } else if (d.kind === 'scale') {
        const pivotX = rect.left + (d.pivotXPct! / 100) * rw
        const pivotY = rect.top + (d.pivotYPct! / 100) * rh
        const k = Math.hypot(e.clientX - pivotX, e.clientY - pivotY) / (d.startLen || 1)
        if (d.target.kind === 'group') {
          onChange(scaleGroupAround(d.startState, d.target.id, k, d.pivotXPct!, d.pivotYPct!, rw, rh))
        } else {
          onChange(patchLayerTransform(d.startState, d.target.id, scaleTransformAround(d.startT, k, d.pivotXPct!, d.pivotYPct!)))
        }
      } else {
        const a1 = Math.atan2(e.clientY - d.centerY!, e.clientX - d.centerX!)
        const deg = ((a1 - d.a0!) * 180) / Math.PI
        if (d.target.kind === 'group') {
          onChange(rotateGroupAround(d.startState, d.target.id, deg, d.pivotXPct!, d.pivotYPct!, rw, rh))
        } else {
          onChange(patchLayerTransform(d.startState, d.target.id, { rotation: d.startT.rotation + deg }))
        }
      }
    },
    [onChange],
  )

  const onUp = useCallback(() => {
    drag.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }, [onMove])

  const begin = useCallback(
    (d: DragState) => {
      drag.current = d
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onMove, onUp],
  )

  // ── box geometry for a target (single layer or group) ────────────────────────
  function boxOf(target: Target): { cx: number; cy: number; w: number; h: number } | null {
    if (target.kind === 'group') {
      const bb = groupBBox(state.layers, target.id)
      return bb ? { cx: bb.cx, cy: bb.cy, w: bb.w, h: bb.h } : null
    }
    const l = state.layers.find((x) => x.id === target.id)
    if (!l) return null
    const t = l.transform ?? DEFAULT_TRANSFORM
    return { cx: t.xPct, cy: t.yPct, w: t.widthPct, h: t.heightPct ?? t.widthPct }
  }

  const startMove = (e: ReactPointerEvent, target: Target, startT: TransformLike) => {
    begin({ kind: 'move', target, startState: state, startT, sx: e.clientX, sy: e.clientY })
  }

  const startScale = (e: ReactPointerEvent, target: Target, corner: number) => {
    e.preventDefault()
    e.stopPropagation()
    const el = containerRef.current
    const box = boxOf(target)
    if (!el || !box) return
    const rect = el.getBoundingClientRect()
    const cs = corners(box.cx, box.cy, box.w, box.h)
    const pivot = cs[(corner + 2) % 4]
    const handle = cs[corner]
    const pivotX = rect.left + (pivot[0] / 100) * rect.width
    const pivotY = rect.top + (pivot[1] / 100) * rect.height
    const handleX = rect.left + (handle[0] / 100) * rect.width
    const handleY = rect.top + (handle[1] / 100) * rect.height
    const startLen = Math.hypot(handleX - pivotX, handleY - pivotY) || 1
    const l = target.kind === 'layer' ? state.layers.find((x) => x.id === target.id) : undefined
    begin({
      kind: 'scale',
      target,
      startState: state,
      startT: l?.transform ?? DEFAULT_TRANSFORM,
      sx: e.clientX,
      sy: e.clientY,
      pivotXPct: pivot[0],
      pivotYPct: pivot[1],
      startLen,
    })
  }

  const startRotate = (e: ReactPointerEvent, target: Target) => {
    e.preventDefault()
    e.stopPropagation()
    const el = containerRef.current
    const box = boxOf(target)
    if (!el || !box) return
    const rect = el.getBoundingClientRect()
    const centerX = rect.left + (box.cx / 100) * rect.width
    const centerY = rect.top + (box.cy / 100) * rect.height
    const a0 = Math.atan2(e.clientY - centerY, e.clientX - centerX)
    const l = target.kind === 'layer' ? state.layers.find((x) => x.id === target.id) : undefined
    begin({
      kind: 'rotate',
      target,
      startState: state,
      startT: l?.transform ?? DEFAULT_TRANSFORM,
      sx: e.clientX,
      sy: e.clientY,
      pivotXPct: box.cx,
      pivotYPct: box.cy,
      centerX,
      centerY,
      a0,
    })
  }

  const onLayerDown = (e: ReactPointerEvent, l: ComposerLayer) => {
    e.preventDefault()
    e.stopPropagation()
    if (l.groupId) {
      onSelect({ kind: 'group', id: l.groupId })
      startMove(e, { kind: 'group', id: l.groupId }, DEFAULT_TRANSFORM)
      return
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onToggleMulti(l.id)
      return
    }
    onSelect({ kind: 'layer', id: l.id })
    startMove(e, { kind: 'layer', id: l.id }, l.transform ?? DEFAULT_TRANSFORM)
  }

  const groupBox = selection?.kind === 'group' ? boxOf({ kind: 'group', id: selection.id }) : null

  return (
    <div ref={containerRef} className="absolute inset-0 z-40" data-share-ui="true">
      {/* per-layer select/move boxes */}
      {state.layers.filter((l) => l.visible).map((l) => {
        const t = l.transform ?? DEFAULT_TRANSFORM
        const w = t.widthPct
        const h = t.heightPct ?? t.widthPct
        const selectedLayer = selection?.kind === 'layer' && selection.id === l.id
        const inMulti = multiSel.includes(l.id)
        const boxStyle: CSSProperties = {
          position: 'absolute',
          left: `${t.xPct - w / 2}%`,
          top: `${t.yPct - h / 2}%`,
          width: `${w}%`,
          height: `${h}%`,
        }
        const ring = selectedLayer
          ? 'ring-2 ring-sky-400/90'
          : inMulti
            ? 'ring-2 ring-sky-400/50'
            : 'ring-1 ring-transparent hover:ring-white/30'
        return (
          <div key={l.id} style={boxStyle}>
            <div
              onPointerDown={(e) => onLayerDown(e, l)}
              className={`absolute inset-0 cursor-move rounded ${ring}`}
            />
            {selectedLayer && !l.groupId && (
              <>
                {[0, 1, 2, 3].map((corner) => (
                  <div
                    key={corner}
                    onPointerDown={(e) => startScale(e, { kind: 'layer', id: l.id }, corner)}
                    className={`absolute h-2.5 w-2.5 rounded-sm border border-sky-400 bg-neutral-900 ${CORNER_POS[corner]}`}
                  />
                ))}
                <div className="absolute left-1/2 h-[14px] w-px -translate-x-1/2 bg-sky-400/70" style={{ top: -14 }} />
                <div
                  onPointerDown={(e) => startRotate(e, { kind: 'layer', id: l.id })}
                  title="Rotate"
                  className="absolute left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border border-sky-400 bg-neutral-900"
                  style={{ top: -22 }}
                />
              </>
            )}
          </div>
        )
      })}

      {/* group selection box + handles */}
      {groupBox && selection?.kind === 'group' && (
        <div
          style={{
            position: 'absolute',
            left: `${groupBox.cx - groupBox.w / 2}%`,
            top: `${groupBox.cy - groupBox.h / 2}%`,
            width: `${groupBox.w}%`,
            height: `${groupBox.h}%`,
          }}
        >
          <div
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              startMove(e, { kind: 'group', id: selection.id }, DEFAULT_TRANSFORM)
            }}
            className="absolute inset-0 cursor-move rounded border border-dashed border-sky-400/80 bg-sky-400/5"
          />
          {[0, 1, 2, 3].map((corner) => (
            <div
              key={corner}
              onPointerDown={(e) => startScale(e, { kind: 'group', id: selection.id }, corner)}
              className={`absolute h-2.5 w-2.5 rounded-sm border border-sky-400 bg-neutral-900 ${CORNER_POS[corner]}`}
            />
          ))}
          <div className="absolute left-1/2 h-[14px] w-px -translate-x-1/2 bg-sky-400/70" style={{ top: -14 }} />
          <div
            onPointerDown={(e) => startRotate(e, { kind: 'group', id: selection.id })}
            title="Rotate group"
            className="absolute left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border border-sky-400 bg-neutral-900"
            style={{ top: -22 }}
          />
        </div>
      )}
    </div>
  )
}
