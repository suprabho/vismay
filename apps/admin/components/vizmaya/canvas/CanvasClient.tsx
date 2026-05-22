'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ResolvedUnit } from '@vismay/viz-engine'
import CanvasTile from './CanvasTile'

interface Props {
  slug: string
  units: ResolvedUnit[]
}

const TILE_W = 360
const TILE_H = 260
const TILE_GAP = 56
const COLS = 4
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

interface TilePlacement {
  id: string
  unit: ResolvedUnit
  x: number
  y: number
  w: number
  h: number
}

/**
 * Auto-layout fallback. Eventually the canvas reads tile positions from a
 * sidecar `<story>.canvas.yaml`; until then we lay sections out in a flowing
 * grid keyed by section order. One tile per parent section — subsections
 * collapse into the parent for now (canvas granularity = section).
 */
function autoLayout(sectionUnits: ResolvedUnit[]): TilePlacement[] {
  return sectionUnits.map((unit, i) => ({
    id: unit.parentConfig.id ?? `section-${unit.parentIndex}`,
    unit,
    x: (i % COLS) * (TILE_W + TILE_GAP),
    y: Math.floor(i / COLS) * (TILE_H + TILE_GAP),
    w: TILE_W,
    h: TILE_H,
  }))
}

export default function CanvasClient({ slug, units }: Props) {
  const sectionUnits = useMemo(() => units.filter((u) => u.subIndex === 0), [units])
  const tiles = useMemo(() => autoLayout(sectionUnits), [sectionUnits])

  const [pan, setPan] = useState({ x: 120, y: 100 })
  const [zoom, setZoom] = useState(0.85)
  const [focusedId, setFocusedId] = useState<string | null>(tiles[0]?.id ?? null)
  const [isPanning, setIsPanning] = useState(false)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  // React's onWheel is passive in modern Next, so preventDefault() inside it
  // is a no-op. Attach a non-passive listener manually so ctrl/cmd+wheel
  // zoom doesn't double up with the browser's page zoom.
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
          // Keep the world-point under the cursor pinned during zoom.
          setPan((p) => ({
            x: cx - ((cx - p.x) * next) / z,
            y: cy - ((cy - p.y) * next) / z,
          }))
          return next
        })
      } else {
        // Plain wheel pans — two-finger trackpad scroll is the dominant
        // input on the audience we're building this for. shift+wheel could
        // remap to horizontal-only later if mice-with-wheels users complain.
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Pan only when the empty canvas is grabbed — not when a tile is clicked.
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
    if (!el || tiles.length === 0) return
    const maxX = Math.max(...tiles.map((t) => t.x + t.w))
    const maxY = Math.max(...tiles.map((t) => t.y + t.h))
    const padding = 80
    const zx = (el.clientWidth - padding * 2) / maxX
    const zy = (el.clientHeight - padding * 2) / maxY
    const z = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM)
    setZoom(z)
    setPan({ x: padding, y: padding })
  }, [tiles])

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
            {tiles.length} sections · {(zoom * 100).toFixed(0)}%
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <Btn onClick={() => setZoom((z) => clamp(z * 0.9, MIN_ZOOM, MAX_ZOOM))}>−</Btn>
          <Btn onClick={() => setZoom((z) => clamp(z * 1.1, MIN_ZOOM, MAX_ZOOM))}>+</Btn>
          <Btn onClick={fitAll}>fit</Btn>
          <Btn onClick={() => { setZoom(1); setPan({ x: 120, y: 100 }) }}>1:1</Btn>
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
          // Dot grid drifts with pan/zoom — gives the surface a "real space"
          // feel without rendering a million separate dot elements.
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
            // Click-through on the transform layer itself so background
            // mousedown still pans; tiles re-enable pointer events.
            pointerEvents: 'none',
          }}
        >
          {tiles.map((tile) => (
            <div
              key={tile.id}
              style={{
                position: 'absolute',
                left: tile.x,
                top: tile.y,
                width: tile.w,
                height: tile.h,
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
              onClick={() => setFocusedId(tile.id)}
            >
              <CanvasTile
                unit={tile.unit}
                index={tile.unit.parentIndex}
                focused={focusedId === tile.id}
              />
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
        <span>drag empty canvas to pan · cmd/ctrl + wheel to zoom · click a tile to focus</span>
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
