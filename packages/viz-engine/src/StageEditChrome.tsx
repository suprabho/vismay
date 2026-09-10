'use client'

import { useEffect, useRef, useState } from 'react'
import type { ResolvedStage } from './lib/storyConfig.types'
import type { StageEditPatch } from './lib/stageEditorProtocol'

/**
 * On-canvas edit chrome for the admin stage-timeline editor (W2). Mounted by
 * `StageVizSlot` only when the shell context's `editing` flag is set (the
 * `?editor=1` iframe) — dead code everywhere else.
 *
 * All gesture code lives HERE, inside the iframe, because the admin page is
 * cross-origin and cannot reach this document: pointer math happens where the
 * pixels are, and only SEMANTIC edits cross the boundary
 * (`viz-story-entity-pointerdown` / `viz-story-entity-edit`, with
 * absolute-from-gesture-start values so re-applying is idempotent). The
 * parent owns selection (`viz-story-selection` inbound) and the config; its
 * stage push (`viz-story-stage`, W1) is the render path — this component
 * NEVER writes entity styles (the rAF clock in `StageVizSlot` owns them).
 *
 * Structure borrowed from the composer's FreeTransformLayer: snapshot the
 * pose at pointerdown and recompute every frame from that snapshot (no
 * drift); 4 corner scale handles + a rotate stem; window-level
 * pointermove/pointerup.
 *
 * Coordinate math is the inverse of `poseCss`: stage x/y are in centred
 * space where 1.0 = 50vmin = half the viewport min-dimension, and y is
 * screen-UP (CSS y negated). `translate` precedes `scale`/`rotate` in the
 * transform list, so pointer deltas map linearly to position regardless of
 * the entity's scale/rotation.
 */

interface Selection {
  id: string
  /** False when the current beat holds no keyframe for this entity — the
   *  parent has nothing to write to, so handles hide and no edits emit. */
  editable: boolean
}

interface DragState {
  kind: 'move' | 'scale' | 'rotate'
  id: string
  gesture: string
  sx: number
  sy: number
  /** Pose at pointerdown, inverted from the DOM (stage units / degrees). */
  start: { x: number; y: number; scale: number; rotation: number }
  /** Entity centre in client px at pointerdown (scale/rotate pivot). */
  cx: number
  cy: number
  startLen: number
  a0: number
  latest: StageEditPatch | null
  raf: number | null
  emitted: boolean
}

const r3 = (n: number) => Math.round(n * 1000) / 1000
const r1 = (n: number) => Math.round(n * 10) / 10

function post(msg: unknown) {
  window.parent.postMessage(msg, '*')
}

/** Invert the rendered pose from the DOM. The bounding-rect centre is
 *  rotation/scale-invariant (transform-origin is the element centre);
 *  scale/rotation come from the computed matrix (the rect's width is
 *  rotation-contaminated and unusable for scale). */
function invertPose(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const halfMin = Math.min(window.innerWidth, window.innerHeight) / 2
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const m = new DOMMatrix(getComputedStyle(el).transform)
  return {
    cx,
    cy,
    halfMin,
    x: (cx - window.innerWidth / 2) / halfMin,
    y: -(cy - window.innerHeight / 2) / halfMin,
    scale: Math.hypot(m.a, m.b),
    rotation: Math.atan2(m.b, m.a) * (180 / Math.PI),
  }
}

const CORNERS: { key: string; style: React.CSSProperties; cursor: string }[] = [
  { key: 'tl', style: { left: -5, top: -5 }, cursor: 'nwse-resize' },
  { key: 'tr', style: { right: -5, top: -5 }, cursor: 'nesw-resize' },
  { key: 'br', style: { right: -5, bottom: -5 }, cursor: 'nwse-resize' },
  { key: 'bl', style: { left: -5, bottom: -5 }, cursor: 'nesw-resize' },
]

export default function StageEditChrome({
  stage,
  activeUnit,
  nodeRefs,
}: {
  stage: ResolvedStage
  activeUnit: number
  nodeRefs: { current: Map<string, HTMLDivElement | null> }
}) {
  const [sel, setSel] = useState<Selection | null>(null)
  const selRef = useRef<Selection | null>(null)
  useEffect(() => {
    selRef.current = sel
  }, [sel])
  const overlayRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  // The gesture effect owns begin(); the handle elements reach it through
  // this ref so their JSX handlers don't need to live inside the effect.
  const beginHandleRef = useRef<((kind: DragState['kind'], id: string, e: PointerEvent) => void) | null>(null)

  // Parent-driven selection.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'viz-story-selection') return
      const id = e.data.id
      if (id !== null && typeof id !== 'string') return
      setSel(id ? { id, editable: e.data.editable === true } : null)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Gesture machinery. One begin() shared by move (entity press) and the
  // handle gestures; window-level listeners for the life of the gesture.
  useEffect(() => {
    const emit = (drag: DragState, phase: 'move' | 'end') => {
      if (!drag.latest) return
      const s = selRef.current
      // Only a selected+editable entity may write; frames carry absolute
      // values, so frames dropped before the selection ack lose nothing.
      if (!s || s.id !== drag.id || !s.editable) return
      drag.emitted = true
      post({
        type: 'viz-story-entity-edit',
        id: drag.id,
        gesture: drag.gesture,
        phase,
        patch: drag.latest,
      })
    }

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const halfMin = Math.min(window.innerWidth, window.innerHeight) / 2
      if (drag.kind === 'move') {
        drag.latest = {
          x: r3(drag.start.x + (e.clientX - drag.sx) / halfMin),
          y: r3(drag.start.y - (e.clientY - drag.sy) / halfMin),
        }
      } else if (drag.kind === 'scale') {
        const len = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy)
        drag.latest = { scale: r3(Math.max(0.01, drag.start.scale * (len / (drag.startLen || 1)))) }
      } else {
        const a1 = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx)
        drag.latest = { rotation: r1(drag.start.rotation + ((a1 - drag.a0) * 180) / Math.PI) }
      }
      if (drag.raf == null) {
        drag.raf = requestAnimationFrame(() => {
          drag.raf = null
          emit(drag, 'move')
        })
      }
    }

    const onUp = () => {
      const drag = dragRef.current
      if (!drag) return
      if (drag.raf != null) cancelAnimationFrame(drag.raf)
      if (drag.emitted || drag.latest) emit(drag, 'end')
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    const begin = (kind: DragState['kind'], id: string, e: PointerEvent) => {
      const el = nodeRefs.current.get(id)
      if (!el) return
      const p = invertPose(el)
      dragRef.current = {
        kind,
        id,
        gesture: `${kind}:${id}:${Math.round(performance.now())}`,
        sx: e.clientX,
        sy: e.clientY,
        start: { x: p.x, y: p.y, scale: p.scale, rotation: p.rotation },
        cx: p.cx,
        cy: p.cy,
        startLen: Math.hypot(e.clientX - p.cx, e.clientY - p.cy),
        a0: Math.atan2(e.clientY - p.cy, e.clientX - p.cx),
        latest: null,
        raf: null,
        emitted: false,
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    // Select-then-drag in one gesture: capture-phase so entity presses are
    // seen before anything else; chrome-owned handles are excluded (they
    // begin their own gestures via beginHandleRef below). Hit-testing goes
    // through `elementsFromPoint`, NOT `e.target`: `zBand: behind|mid`
    // entities paint in the BACK container underneath the scrolling content,
    // so the section on top swallows the direct target — but editing mode
    // gives every entity `pointer-events: auto`, which keeps them in the
    // elementsFromPoint list even when overlapped. Topmost entity wins.
    const onPointerDown = (e: PointerEvent) => {
      if (dragRef.current) return
      const target = e.target as Element | null
      if (!target || overlayRef.current?.contains(target)) return
      let id: string | undefined
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const hit = (el as HTMLElement).closest?.('[data-stage-entity]') as HTMLElement | null
        if (hit?.dataset.stageEntity) {
          id = hit.dataset.stageEntity
          break
        }
      }
      if (!id) return
      e.preventDefault()
      post({ type: 'viz-story-entity-pointerdown', id })
      begin('move', id, e)
    }
    beginHandleRef.current = begin
    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (dragRef.current?.raf != null) cancelAnimationFrame(dragRef.current.raf)
      dragRef.current = null
    }
  }, [nodeRefs])

  // Hotkey forwarding: clicking the preview focuses this (cross-origin)
  // document, so the admin page's own ⌘Z/⌘S listeners go deaf — forward the
  // intents instead of the keys.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        post({ type: 'viz-story-hotkey', action: 'undo' })
      } else if (e.key === 's') {
        e.preventDefault()
        post({ type: 'viz-story-hotkey', action: 'save' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Ring positioning: a rAF loop reading the live node rect (the clock writes
  // transforms imperatively, so React state can't know where the entity is).
  // Imperative style writes on the ring — no per-frame re-render.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const ring = ringRef.current
      if (!ring) return
      const s = selRef.current
      const el = s ? nodeRefs.current.get(s.id) : null
      if (!s || !el || !el.isConnected) {
        ring.style.display = 'none'
        return
      }
      const rect = el.getBoundingClientRect()
      ring.style.display = 'block'
      ring.style.left = `${rect.left}px`
      ring.style.top = `${rect.top}px`
      ring.style.width = `${rect.width}px`
      ring.style.height = `${rect.height}px`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [nodeRefs])

  const handleDown = (kind: DragState['kind']) => (e: React.PointerEvent) => {
    const s = selRef.current
    if (!s || !s.editable) return
    e.preventDefault()
    e.stopPropagation()
    beginHandleRef.current?.(kind, s.id, e.nativeEvent)
  }

  // Selection can outlive the entity's presence on the active beat — the
  // ring loop hides it; nothing else to clean up (stage/activeUnit are in
  // props only so the component re-renders with fresh frames).
  void stage
  void activeUnit

  const handleBase: React.CSSProperties = {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#7dd3fc',
    borderRadius: 2,
    pointerEvents: 'auto',
  }

  return (
    <div
      ref={overlayRef}
      data-stage-edit-chrome
      style={{ position: 'fixed', inset: 0, zIndex: 40, pointerEvents: 'none' }}
    >
      <div
        ref={ringRef}
        style={{
          position: 'absolute',
          display: 'none',
          outline: '1px solid #7dd3fc',
          outlineOffset: 2,
        }}
      >
        {sel?.editable ? (
          <>
            {CORNERS.map((c) => (
              <div
                key={c.key}
                onPointerDown={handleDown('scale')}
                style={{ ...handleBase, ...c.style, cursor: c.cursor }}
              />
            ))}
            {/* rotate stem + knob above top-centre */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: -16,
                width: 1,
                height: 14,
                background: '#7dd3fc',
              }}
            />
            <div
              onPointerDown={handleDown('rotate')}
              style={{
                position: 'absolute',
                left: 'calc(50% - 5px)',
                top: -26,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#7dd3fc',
                pointerEvents: 'auto',
                cursor: 'crosshair',
              }}
            />
          </>
        ) : sel ? (
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: -24,
              whiteSpace: 'nowrap',
              fontSize: 11,
              color: '#fbbf24',
              background: 'rgba(0,0,0,0.6)',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            no keyframe on this beat — add one in the timeline
          </span>
        ) : null}
      </div>
    </div>
  )
}
