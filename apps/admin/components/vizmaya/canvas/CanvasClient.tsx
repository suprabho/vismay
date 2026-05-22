'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MapOverrideConfig,
  ResolvedUnit,
  StoryDefaults,
} from '@vismay/viz-engine'
import CanvasFrame from './CanvasFrame'
import InputNode, { type InputNodeData } from './InputNode'
import CanvasWires, { type Wire } from './CanvasWires'
import { buildInputsForUnit } from './canvasInputs'

interface Props {
  slug: string
  units: ResolvedUnit[]
  defaults: StoryDefaults
  mapOverrides: MapOverrideConfig | null | undefined
  accessToken: string
}

const FRAME_W = 480
const FRAME_H = 320
// Horizontal gap between section frames. Generous so each frame's input
// subgraph has room to fan in to the left without colliding with the
// previous frame in row order.
const FRAME_GAP_X = 560
const FRAME_GAP_Y = 200
const COLS = 3

const INPUT_W = 280
const INPUT_H = 88
const INPUT_GAP_Y = 28
/** Horizontal gap between an input node's right edge and its frame's left edge. */
const INPUT_TO_FRAME_GAP = 96

const MIN_ZOOM = 0.15
const MAX_ZOOM = 3

interface FramePlacement {
  id: string
  unit: ResolvedUnit
  x: number
  y: number
  w: number
  h: number
}

interface InputPlacement {
  id: string
  data: InputNodeData
  x: number
  y: number
  w: number
  h: number
}

/**
 * Auto-layout fallback. Eventually replaced by a `<story>.canvas.yaml`
 * sidecar; until then frames flow in a grid keyed by section order.
 * Granularity = parent section (subsections collapse for now).
 */
function autoLayout(sectionUnits: ResolvedUnit[]): FramePlacement[] {
  return sectionUnits.map((unit, i) => ({
    id: unit.parentConfig.id ?? `section-${unit.parentIndex}`,
    unit,
    x: (i % COLS) * (FRAME_W + FRAME_GAP_X),
    y: Math.floor(i / COLS) * (FRAME_H + FRAME_GAP_Y),
    w: FRAME_W,
    h: FRAME_H,
  }))
}

/**
 * Build the subgraph (inputs + wires) for the focused frame. Inputs stack
 * vertically to the left of the frame; wires converge to the frame's
 * left-center, just like the reference diagram.
 */
function buildSubgraph(frame: FramePlacement): { inputs: InputPlacement[]; wires: Wire[] } {
  const inputs = buildInputsForUnit(frame.unit)
  const totalH = inputs.length * INPUT_H + (inputs.length - 1) * INPUT_GAP_Y
  const startY = frame.y + frame.h / 2 - totalH / 2
  const x = frame.x - INPUT_W - INPUT_TO_FRAME_GAP

  const placements: InputPlacement[] = inputs.map((data, i) => ({
    id: data.id,
    data,
    x,
    y: startY + i * (INPUT_H + INPUT_GAP_Y),
    w: INPUT_W,
    h: INPUT_H,
  }))

  const targetX = frame.x
  const targetY = frame.y + frame.h / 2
  const wires: Wire[] = placements.map((p) => ({
    id: `${frame.id}:${p.id}`,
    x1: p.x + p.w,
    y1: p.y + p.h / 2,
    x2: targetX,
    y2: targetY,
  }))

  return { inputs: placements, wires }
}

export default function CanvasClient({
  slug,
  units,
  defaults,
  mapOverrides,
  accessToken,
}: Props) {
  const sectionUnits = useMemo(() => units.filter((u) => u.subIndex === 0), [units])
  const frames = useMemo(() => autoLayout(sectionUnits), [sectionUnits])

  const [pan, setPan] = useState({ x: 400, y: 120 })
  const [zoom, setZoom] = useState(0.7)
  const [focusedId, setFocusedId] = useState<string | null>(frames[0]?.id ?? null)
  const [isPanning, setIsPanning] = useState(false)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const focusedFrame = useMemo(
    () => frames.find((f) => f.id === focusedId) ?? null,
    [frames, focusedId]
  )
  const subgraph = useMemo(
    () => (focusedFrame ? buildSubgraph(focusedFrame) : { inputs: [], wires: [] }),
    [focusedFrame]
  )

  // Non-passive wheel listener — onWheel is passive in modern Next, which
  // makes preventDefault() a no-op there. Attaching directly lets us block
  // browser pinch-zoom on cmd/ctrl + wheel.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        setZoom((z) => {
          const next = clamp(z * (1 - e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM)
          if (next === z) return z
          setPan((p) => ({
            x: cx - ((cx - p.x) * next) / z,
            y: cy - ((cy - p.y) * next) / z,
          }))
          return next
        })
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.hasAttribute('data-canvas-bg')) return
    dragRef.current = { x: e.clientX, y: e.clientY }
    setIsPanning(true)
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current
    if (!drag) return
    setPan((p) => ({
      x: p.x + (e.clientX - drag.x),
      y: p.y + (e.clientY - drag.y),
    }))
    dragRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseUp = useCallback(() => {
    dragRef.current = null
    setIsPanning(false)
  }, [])

  const fitAll = useCallback(() => {
    const el = surfaceRef.current
    if (!el || frames.length === 0) return
    // Extent includes both frames and their input subgraphs to the left.
    const minX = Math.min(...frames.map((f) => f.x)) - (INPUT_W + INPUT_TO_FRAME_GAP)
    const maxX = Math.max(...frames.map((f) => f.x + f.w))
    const minY = Math.min(...frames.map((f) => f.y)) - 60
    const maxY = Math.max(...frames.map((f) => f.y + f.h))
    const padding = 80
    const w = maxX - minX
    const h = maxY - minY
    const zx = (el.clientWidth - padding * 2) / w
    const zy = (el.clientHeight - padding * 2) / h
    const z = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM)
    setZoom(z)
    setPan({ x: padding - minX * z, y: padding - minY * z })
  }, [frames])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0a',
        overflow: 'hidden',
        color: '#ccc',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          zIndex: 10,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(20, 20, 20, 0.8)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #2a2a2a',
            borderRadius: 6,
            padding: '8px 14px',
            display: 'flex',
            gap: 16,
            alignItems: 'baseline',
            pointerEvents: 'auto',
          }}
        >
          <strong style={{ fontSize: 13 }}>{slug}</strong>
          <span style={{ fontSize: 11, color: '#888' }}>
            {frames.length} sections · {(zoom * 100).toFixed(0)}%
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <Btn onClick={() => setZoom((z) => clamp(z * 0.9, MIN_ZOOM, MAX_ZOOM))}>−</Btn>
          <Btn onClick={() => setZoom((z) => clamp(z * 1.1, MIN_ZOOM, MAX_ZOOM))}>+</Btn>
          <Btn onClick={fitAll}>fit</Btn>
          <Btn onClick={() => { setZoom(1); setPan({ x: 400, y: 120 }) }}>1:1</Btn>
        </div>
      </header>

      <div
        ref={surfaceRef}
        data-canvas-bg
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: isPanning ? 'grabbing' : 'grab',
          backgroundImage: 'radial-gradient(circle, #1f1f1f 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            willChange: 'transform',
            pointerEvents: 'none',
          }}
        >
          {/* Wires render BEHIND nodes — first child of the transform layer. */}
          <CanvasWires wires={subgraph.wires} />

          {/* Section frames */}
          {frames.map((frame) => (
            <div
              key={frame.id}
              style={{
                position: 'absolute',
                left: frame.x,
                top: frame.y,
                width: frame.w,
                height: frame.h,
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
              onClick={() => setFocusedId(frame.id)}
            >
              <CanvasFrame
                slug={slug}
                unit={frame.unit}
                index={frame.unit.parentIndex}
                focused={focusedId === frame.id}
                accessToken={accessToken}
                defaults={defaults}
                mapOverrides={mapOverrides}
              />
            </div>
          ))}

          {/* Input subgraph for the focused frame — appears only around the
              one expanded frame, so the canvas doesn't drown in 5N nodes. */}
          {subgraph.inputs.map((node) => (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                width: node.w,
                height: node.h,
                pointerEvents: 'auto',
              }}
            >
              <InputNode data={node.data} />
            </div>
          ))}
        </div>
      </div>

      <footer
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          fontSize: 11,
          color: '#555',
          display: 'flex',
          justifyContent: 'space-between',
          pointerEvents: 'none',
        }}
      >
        <span>drag empty canvas to pan · cmd/ctrl + wheel to zoom · click a frame to expand its inputs</span>
        <span>
          pan {pan.x.toFixed(0)}, {pan.y.toFixed(0)}
        </span>
      </footer>
    </div>
  )
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(20, 20, 20, 0.8)',
        backdropFilter: 'blur(8px)',
        color: '#ccc',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '6px 12px',
        fontSize: 12,
        cursor: 'pointer',
        minWidth: 36,
      }}
    >
      {children}
    </button>
  )
}
