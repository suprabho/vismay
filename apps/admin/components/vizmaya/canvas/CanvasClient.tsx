'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ResolvedUnit } from '@vismay/viz-engine'
import CanvasFrame from './CanvasFrame'
import InputNode, { type InputNodeData } from './InputNode'
import OutputNode, { type OutputNodeData } from './OutputNode'
import CanvasWires, { type Wire } from './CanvasWires'
import {
  buildInputsForUnit,
  parseCanvasSources,
  type CanvasSources,
} from './canvasInputs'
import { buildOutputsForUnit } from './canvasOutputs'

interface Props {
  slug: string
  units: ResolvedUnit[]
  sources: CanvasSources
  publicSiteUrl: string
}

const DEFAULT_W = 1920
const DEFAULT_H = 1080
// Gap scales with the bigger frames so the input subgraph has room to fan
// in without colliding with the previous row.
const FRAME_GAP_X = 720
const FRAME_GAP_Y = 360
const COLS = 3

const INPUT_W = 320
const INPUT_H = 110
const INPUT_GAP_Y = 36
const INPUT_TO_FRAME_GAP = 120

// Outputs sit to the right of the focused frame at their native dimensions
// (1920×1080, 1440×1080, …). Gap is generous because the nodes themselves
// are huge — at 1:1 zoom one slides node alone is wider than the input
// column.
const OUTPUT_TO_FRAME_GAP = 240
const OUTPUT_GAP_Y = 120

const MIN_ZOOM = 0.05
const MAX_ZOOM = 3
const MIN_FRAME_W = 360
const MIN_FRAME_H = 240

/**
 * Frame-size presets matching real device viewports, not aspect ratios.
 * 1:1 / 9:16 / A4 / etc. live downstream as output nodes (share cards,
 * autoplay videos, report PDFs) — those are derived renders, not
 * preview surfaces.
 *
 * The two "demo" dimensions match vizmaya-fyi's StoryPreview component
 * exactly, so the section in a canvas tile and the section behind that
 * demo's bezel see the same viewport.
 */
interface SizePreset {
  id: string
  label: string
  w: number
  h: number
  /** Short device name rendered under the dimensions, e.g. "iPhone 14". */
  tag: string
}

const SIZE_PRESETS: SizePreset[] = [
  { id: 'desktop-fhd', label: '1920 × 1080', w: 1920, h: 1080, tag: 'Desktop FHD' },
  { id: 'desktop-demo', label: '1440 × 810', w: 1440, h: 810, tag: 'vizmaya demo' },
  { id: 'phone', label: '390 × 844', w: 390, h: 844, tag: 'iPhone 14' },
]

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

interface OutputPlacement {
  id: string
  data: OutputNodeData
  x: number
  y: number
  w: number
  h: number
}

function autoLayout(sectionUnits: ResolvedUnit[]): FramePlacement[] {
  return sectionUnits.map((unit, i) => ({
    id: unit.parentConfig.id ?? `section-${unit.parentIndex}`,
    unit,
    x: (i % COLS) * (DEFAULT_W + FRAME_GAP_X),
    y: Math.floor(i / COLS) * (DEFAULT_H + FRAME_GAP_Y),
    w: DEFAULT_W,
    h: DEFAULT_H,
  }))
}

function buildSubgraph(
  frame: FramePlacement,
  parsed: ReturnType<typeof parseCanvasSources>,
  slug: string,
  publicSiteUrl: string
): {
  inputs: InputPlacement[]
  outputs: OutputPlacement[]
  wires: Wire[]
} {
  /* ─── Inputs (left of frame) ────────────────────────────────────── */
  const inputs = buildInputsForUnit(frame.unit, parsed)
  const inputTotalH = inputs.length * INPUT_H + (inputs.length - 1) * INPUT_GAP_Y
  const inputStartY = frame.y + frame.h / 2 - inputTotalH / 2
  const inputX = frame.x - INPUT_W - INPUT_TO_FRAME_GAP

  const inputPlacements: InputPlacement[] = inputs.map((data, i) => ({
    id: data.id,
    data,
    x: inputX,
    y: inputStartY + i * (INPUT_H + INPUT_GAP_Y),
    w: INPUT_W,
    h: INPUT_H,
  }))

  /* ─── Outputs (right of frame) ──────────────────────────────────── */
  const outputs = buildOutputsForUnit(frame.unit, slug, publicSiteUrl)
  const outputTotalH =
    outputs.reduce((acc, o) => acc + o.h, 0) +
    Math.max(0, outputs.length - 1) * OUTPUT_GAP_Y
  const outputStartY = frame.y + frame.h / 2 - outputTotalH / 2
  const outputX = frame.x + frame.w + OUTPUT_TO_FRAME_GAP

  const outputPlacements: OutputPlacement[] = []
  let cursor = outputStartY
  for (const data of outputs) {
    outputPlacements.push({
      id: data.id,
      data,
      x: outputX,
      y: cursor,
      w: data.w,
      h: data.h,
    })
    cursor += data.h + OUTPUT_GAP_Y
  }

  /* ─── Wires (inputs → frame, frame → outputs) ──────────────────── */
  const frameLeftX = frame.x
  const frameRightX = frame.x + frame.w
  const frameMidY = frame.y + frame.h / 2

  const wires: Wire[] = [
    ...inputPlacements.map(
      (p): Wire => ({
        id: `${frame.id}:in:${p.id}`,
        x1: p.x + p.w,
        y1: p.y + p.h / 2,
        x2: frameLeftX,
        y2: frameMidY,
      })
    ),
    ...outputPlacements.map(
      (p): Wire => ({
        id: `${frame.id}:out:${p.id}`,
        x1: frameRightX,
        y1: frameMidY,
        x2: p.x,
        y2: p.y + p.h / 2,
      })
    ),
  ]

  return { inputs: inputPlacements, outputs: outputPlacements, wires }
}

export default function CanvasClient({
  slug,
  units,
  sources,
  publicSiteUrl,
}: Props) {
  const sectionUnits = useMemo(
    () => units.filter((u) => u.subIndex === 0),
    [units]
  )
  // Parse the per-frame override sources once at the top — buildSubgraph
  // re-runs on every focus change but reuses the same parsed objects.
  const parsedSources = useMemo(() => parseCanvasSources(sources), [sources])
  // Frame placements are state, not memo — resize handles mutate w/h per
  // frame. Initial layout still comes from the autoLayout grid.
  const [frames, setFrames] = useState<FramePlacement[]>(() =>
    autoLayout(sectionUnits)
  )
  useEffect(() => {
    setFrames(autoLayout(sectionUnits))
  }, [sectionUnits])

  const [pan, setPan] = useState({ x: 400, y: 120 })
  const [zoom, setZoom] = useState(0.7)
  const [focusedId, setFocusedId] = useState<string | null>(
    frames[0]?.id ?? null
  )
  const [isPanning, setIsPanning] = useState(false)
  const [resizingId, setResizingId] = useState<string | null>(null)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const resizeStartRef = useRef<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  // Live zoom in a ref so the resize handler can read it without re-binding
  // on every zoom change — the listener attaches once per resize start.
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const focusedFrame = useMemo(
    () => frames.find((f) => f.id === focusedId) ?? null,
    [frames, focusedId]
  )
  const subgraph = useMemo(
    () =>
      focusedFrame
        ? buildSubgraph(focusedFrame, parsedSources, slug, publicSiteUrl)
        : { inputs: [], outputs: [], wires: [] },
    [focusedFrame, parsedSources, slug, publicSiteUrl]
  )

  // Non-passive wheel listener — React's onWheel is passive in modern Next,
  // making preventDefault() a no-op there. Attaching directly lets us block
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

  // Resize is a corner drag. Window-level listeners so the gesture survives
  // the cursor wandering off the small handle, and we can release on mouseup
  // anywhere. Coordinates are screen-space; we divide deltas by `zoom` to
  // translate back into canvas-space dimensions.
  const startResize = useCallback(
    (frameId: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const frame = frames.find((f) => f.id === frameId)
      if (!frame) return
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: frame.w,
        h: frame.h,
      }
      setResizingId(frameId)
    },
    [frames]
  )

  useEffect(() => {
    if (!resizingId) return
    const onMove = (e: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      const dx = (e.clientX - start.x) / zoomRef.current
      const dy = (e.clientY - start.y) / zoomRef.current
      setFrames((prev) =>
        prev.map((f) =>
          f.id === resizingId
            ? {
                ...f,
                w: Math.max(MIN_FRAME_W, start.w + dx),
                h: Math.max(MIN_FRAME_H, start.h + dy),
              }
            : f
        )
      )
    }
    const onUp = () => {
      resizeStartRef.current = null
      setResizingId(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizingId])

  const fitAll = useCallback(() => {
    const el = surfaceRef.current
    if (!el || frames.length === 0) return
    // Bounds include the input column to the left and (if a frame is
    // focused) the output stack to the right. Without folding outputs into
    // the bounds, "fit" clips the giant slides / share / autoplay nodes.
    const minX =
      Math.min(...frames.map((f) => f.x)) - (INPUT_W + INPUT_TO_FRAME_GAP)
    let maxX = Math.max(...frames.map((f) => f.x + f.w))
    let minY = Math.min(...frames.map((f) => f.y)) - 60
    let maxY = Math.max(...frames.map((f) => f.y + f.h))
    if (subgraph.outputs.length > 0) {
      maxX = Math.max(maxX, ...subgraph.outputs.map((o) => o.x + o.w))
      minY = Math.min(minY, ...subgraph.outputs.map((o) => o.y))
      maxY = Math.max(maxY, ...subgraph.outputs.map((o) => o.y + o.h))
    }
    const padding = 80
    const w = maxX - minX
    const h = maxY - minY
    const zx = (el.clientWidth - padding * 2) / w
    const zy = (el.clientHeight - padding * 2) / h
    const z = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM)
    setZoom(z)
    setPan({ x: padding - minX * z, y: padding - minY * z })
  }, [frames, subgraph.outputs])

  // Auto-fit on mount — 1920x1080 frames at default zoom would blow the
  // viewport. fitAll's [frames] dep would re-fit on every resize too; use
  // a ref-based guard so we only auto-fit once at startup.
  const didInitialFitRef = useRef(false)
  useEffect(() => {
    if (didInitialFitRef.current) return
    if (frames.length === 0) return
    didInitialFitRef.current = true
    // Defer one frame so the surface ref has measured its container.
    requestAnimationFrame(fitAll)
  }, [frames, fitAll])

  /** Resize the focused frame to a preset's dimensions. No-op if no focus. */
  const applyPreset = useCallback(
    (preset: SizePreset) => {
      if (!focusedId) return
      setFrames((prev) =>
        prev.map((f) =>
          f.id === focusedId ? { ...f, w: preset.w, h: preset.h } : f
        )
      )
    },
    [focusedId]
  )

  /** Match a frame's dimensions to a known preset, if any. Used for the
   *  "selected" state on the preset bar. Exact match — no fuzzy aspect
   *  comparison, since two presets can share the same aspect ratio. */
  const activePresetId = useMemo(() => {
    if (!focusedFrame) return null
    const match = SIZE_PRESETS.find(
      (p) =>
        Math.round(p.w) === Math.round(focusedFrame.w) &&
        Math.round(p.h) === Math.round(focusedFrame.h)
    )
    return match?.id ?? null
  }, [focusedFrame])

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
          flexDirection: 'column',
          gap: 10,
          alignItems: 'stretch',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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
              {focusedFrame &&
                ` · ${Math.round(focusedFrame.w)}×${Math.round(focusedFrame.h)}`}
            </span>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 8,
              pointerEvents: 'auto',
            }}
          >
            <Btn onClick={() => setZoom((z) => clamp(z * 0.9, MIN_ZOOM, MAX_ZOOM))}>−</Btn>
            <Btn onClick={() => setZoom((z) => clamp(z * 1.1, MIN_ZOOM, MAX_ZOOM))}>+</Btn>
            <Btn onClick={fitAll}>fit</Btn>
            <Btn
              onClick={() => {
                setZoom(1)
                setPan({ x: 400, y: 120 })
              }}
            >
              1:1
            </Btn>
          </div>
        </div>

        {/* Preset bar — visible whenever a frame is focused. Clicking sets
            the focused frame's dimensions to that preset. The iframe's
            window resizes with it, which is where matchMedia and the
            engine's @media rules pick up the new viewport shape. */}
        {focusedFrame && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignSelf: 'flex-start',
              background: 'rgba(20, 20, 20, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              padding: 6,
              pointerEvents: 'auto',
            }}
          >
            {SIZE_PRESETS.map((preset) => {
              const isActive = activePresetId === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  title={preset.tag}
                  style={{
                    background: isActive ? '#2a2a2a' : 'transparent',
                    color: isActive ? '#fff' : '#bbb',
                    border: `1px solid ${isActive ? '#555' : 'transparent'}`,
                    borderRadius: 5,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    lineHeight: 1.1,
                  }}
                >
                  <span>{preset.label}</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: isActive ? '#888' : '#555',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {preset.tag}
                  </span>
                </button>
              )
            })}
          </div>
        )}
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
          backgroundImage:
            'radial-gradient(circle, #1f1f1f 1px, transparent 1px)',
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
          <CanvasWires wires={subgraph.wires} />

          {frames.map((frame) => {
            const isFocused = focusedId === frame.id
            const sectionId =
              frame.unit.parentConfig.id ?? `section-${frame.unit.parentIndex}`
            return (
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
                  publicSiteUrl={publicSiteUrl}
                  sectionId={sectionId}
                  unit={frame.unit}
                  index={frame.unit.parentIndex}
                  focused={isFocused}
                />
                {/* Resize handle — bottom-right corner, focused frames only.
                    Window-level mousemove takes over on drag so the gesture
                    survives the cursor leaving the 14px target. */}
                {isFocused && (
                  <div
                    onMouseDown={(e) => startResize(frame.id, e)}
                    title="drag to resize"
                    style={{
                      position: 'absolute',
                      right: -7,
                      bottom: -7,
                      width: 14,
                      height: 14,
                      background: '#fff',
                      border: '2px solid #888',
                      borderRadius: 3,
                      cursor: 'nwse-resize',
                      zIndex: 2,
                    }}
                  />
                )}
              </div>
            )
          })}

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

          {subgraph.outputs.map((node) => (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                width: node.w,
                height: node.h,
                // Containing div doesn't need pointer events — the iframe
                // inside is the only interactive surface, and we've set
                // pointer-events: none on it so canvas pan-drag passes
                // through.
                pointerEvents: 'none',
              }}
            >
              <OutputNode data={node.data} />
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
        <span>
          drag empty canvas to pan · cmd/ctrl + wheel to zoom · click a frame
          to focus · drag the corner handle to resize
        </span>
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

function Btn({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
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
