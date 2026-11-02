'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowsOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
import { ICON_BUTTON } from '../shared'

const MIN = 1
const MAX = 5
const STEP = 1.25
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z))

/**
 * Zoom and pan for the spread render. 1 = fit the column; above that the
 * content grows inside a scrolling frame. Ctrl/⌘ + wheel (or pinch) zooms
 * toward the cursor, the buttons step it, drag pans, and a click that ends a
 * drag never reaches the modules underneath.
 */
export function ZoomFrame({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState(1)
  const frame = useRef<HTMLDivElement>(null)
  // The content point (as fractions of its size) to hold under a viewport point after a zoom.
  const anchor = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null)

  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const el = frame.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = at ? at.x - rect.left : rect.width / 2
    const py = at ? at.y - rect.top : rect.height / 2
    anchor.current = {
      fx: (el.scrollLeft + px) / el.scrollWidth,
      fy: (el.scrollTop + py) / el.scrollHeight,
      px, py,
    }
    setZoom(z => clamp(typeof next === 'number' ? next : z))
  }, [])

  useLayoutEffect(() => {
    const el = frame.current
    const a = anchor.current
    if (!el || !a) return
    el.scrollLeft = a.fx * el.scrollWidth - a.px
    el.scrollTop = a.fy * el.scrollHeight - a.py
    anchor.current = null
  }, [zoom])

  // Ctrl/⌘ + wheel zooms (a trackpad pinch arrives the same way); a plain wheel keeps scrolling the page.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomTo(clamp(zoomRef.current * Math.exp(-e.deltaY * 0.01)), { x: e.clientX, y: e.clientY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  // Drag to pan when zoomed in.
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = frame.current
    if (!el || zoom <= 1 || e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = frame.current
    if (!d || !el) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) { d.moved = true; setDragging(true); el.setPointerCapture(e.pointerId) }
    el.scrollLeft = d.left - dx
    el.scrollTop = d.top - dy
  }
  const endDrag = () => { setDragging(false); setTimeout(() => { drag.current = null }, 0) }
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) { e.stopPropagation(); e.preventDefault() }
  }

  const pct = Math.round(zoom * 100)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1.5 text-xs text-neutral-400">
        <span className="mr-1 hidden sm:inline">Ctrl/⌘ + scroll to zoom{zoom > 1 ? ', drag to pan' : ''}</span>
        <button type="button" className={ICON_BUTTON} disabled={zoom <= MIN} onClick={() => zoomTo(zoom / STEP)} title="Zoom out" aria-label="Zoom out"><MagnifyingGlassMinus size={16} /></button>
        <button type="button" className="inline-flex h-7 w-14 items-center justify-center rounded-md text-xs tabular-nums text-neutral-400 hover:bg-white/[0.08] hover:text-white" onClick={() => zoomTo(1)} title="Reset to fit" aria-label="Reset zoom">{pct}%</button>
        <button type="button" className={ICON_BUTTON} disabled={zoom >= MAX} onClick={() => zoomTo(zoom * STEP)} title="Zoom in" aria-label="Zoom in"><MagnifyingGlassPlus size={16} /></button>
        <button type="button" className={ICON_BUTTON} disabled={zoom === 1} onClick={() => zoomTo(1)} title="Fit to column" aria-label="Fit to column"><ArrowsOut size={16} /></button>
      </div>
      <div
        ref={frame}
        className={`overflow-auto rounded-md ${zoom > 1 ? `max-h-[calc(100vh-10rem)] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}` : ''}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture}
      >
        <div style={{ width: `${zoom * 100}%` }}>{children}</div>
      </div>
    </div>
  )
}
