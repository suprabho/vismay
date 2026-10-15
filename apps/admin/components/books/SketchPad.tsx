'use client'

import { useRef, useState } from 'react'
import { ArrowCounterClockwise, Trash } from '@phosphor-icons/react'
import { PALETTE } from '@/lib/seasonBooks/system'
import { ICON_BUTTON } from './shared'

export const SKETCH_W = 300
export const SKETCH_H = 180
const MAX_STROKES = 80

/** Drawn strokes, read-only, in the sketch's 300 × 180 box. */
export function SketchView({ strokes, className, strokeWidth = 2.5 }: { strokes: string[]; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {strokes.map((d, i) => <path key={i} d={d} fill="none" stroke={PALETTE.ink} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  )
}

/**
 * The rough chart sketch on a spread card: draw with a mouse, pen or finger.
 * Strokes are stored as simplified integer SVG paths, so a sketch costs a few
 * hundred bytes, not an image.
 */
export function SketchPad({ strokes, onChange }: { strokes: string[]; onChange: (next: string[]) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const points = useRef<[number, number][]>([])
  const [live, setLive] = useState<string | null>(null)

  function at(e: React.PointerEvent): [number, number] {
    const r = svg.current!.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * SKETCH_W)
    const y = Math.round(((e.clientY - r.top) / r.height) * SKETCH_H)
    return [Math.max(0, Math.min(SKETCH_W, x)), Math.max(0, Math.min(SKETCH_H, y))]
  }

  const toPath = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')

  function down(e: React.PointerEvent) {
    if (strokes.length >= MAX_STROKES) return
    e.currentTarget.setPointerCapture(e.pointerId)
    points.current = [at(e)]
    setLive(toPath(points.current))
  }

  function move(e: React.PointerEvent) {
    if (!points.current.length) return
    const p = at(e)
    const [lx, ly] = points.current[points.current.length - 1]
    if (Math.hypot(p[0] - lx, p[1] - ly) < 3) return
    points.current.push(p)
    setLive(toPath(points.current))
  }

  function up() {
    const pts = points.current
    points.current = []
    setLive(null)
    if (!pts.length) return
    // A tap becomes a dot.
    onChange([...strokes, toPath(pts.length === 1 ? [pts[0], [pts[0][0] + 1, pts[0][1]]] : pts)])
  }

  return (
    <div className="relative">
      <svg ref={svg} viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`}
        className="block w-full touch-none cursor-crosshair rounded-md" style={{ background: PALETTE.paper, aspectRatio: `${SKETCH_W} / ${SKETCH_H}` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label="Chart sketch: draw here">
        <line x1={20} y1={160} x2={290} y2={160} stroke={PALETTE.rule} strokeWidth={1} />
        <line x1={20} y1={10} x2={20} y2={160} stroke={PALETTE.rule} strokeWidth={1} />
        {strokes.map((d, i) => <path key={i} d={d} fill="none" stroke={PALETTE.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)}
        {live && <path d={live} fill="none" stroke={PALETTE.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        {!strokes.length && !live && (
          <text x={SKETCH_W / 2} y={SKETCH_H / 2} textAnchor="middle" fontSize={11} fill={PALETTE.muted}>Sketch the chart that proves the headline</text>
        )}
      </svg>
      <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-md bg-neutral-900/80 p-0.5">
        <button type="button" className={ICON_BUTTON} title="Undo stroke" disabled={!strokes.length} onClick={() => onChange(strokes.slice(0, -1))}>
          <ArrowCounterClockwise size={15} />
        </button>
        <button type="button" className={ICON_BUTTON} title="Clear sketch" disabled={!strokes.length} onClick={() => onChange([])}>
          <Trash size={15} />
        </button>
      </div>
    </div>
  )
}
