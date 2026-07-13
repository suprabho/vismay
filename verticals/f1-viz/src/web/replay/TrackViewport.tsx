import { useEffect, useMemo, useRef } from 'react'
import type {
  AggregatesByDriverLap,
  CarPositionTrack,
  CircuitGeometry,
  ProcessedLap,
  RaceDriver,
  SectorBests,
} from './types'
import { buildProjector, interpolateFrame } from './trackProjection'
import { SectorOutline, type SectorColor } from './SectorOutline'

interface Props {
  circuit: CircuitGeometry | null
  drivers: RaceDriver[]
  tracks: Map<number, CarPositionTrack>
  visibleDrivers: Set<number>
  focusedDriver: number | null
  focusedLaps: ProcessedLap[]
  sectorBests: SectorBests | null
  currentLap: number
  aggregates: AggregatesByDriverLap
  /** Mutable ref so parent's rAF loop can drive position updates without re-rendering. */
  currentTimeRef: React.RefObject<number>
  /** Bumped by the parent when it expects redraws (typically every animation frame). */
  redrawSignal: number
}

const VIEWPORT_W = 760
const VIEWPORT_H = 460

interface CircleHandles {
  circle: SVGCircleElement | null
  label: SVGTextElement | null
  speedText: SVGTextElement | null
}

const APPROX_EQ = (a: number, b: number) => Math.abs(a - b) < 0.001

function classifySectors(
  focusedDriver: number | null,
  focusedLaps: ProcessedLap[],
  currentLap: number,
  sectorBests: SectorBests | null,
): [SectorColor, SectorColor, SectorColor] {
  if (focusedDriver == null || !sectorBests) return ['neutral', 'neutral', 'neutral']
  const lap = focusedLaps.find((l) => l.lap === currentLap)
  if (!lap) return ['neutral', 'neutral', 'neutral']
  const dBest = sectorBests.driverBests[focusedDriver]
  const purple = sectorBests.sessionPurple
  const out: SectorColor[] = ['neutral', 'neutral', 'neutral']
  const sectorKeys: Array<'s1' | 's2' | 's3'> = ['s1', 's2', 's3']

  for (let i = 0; i < 3; i++) {
    const t = lap.sectors[i] ?? 0
    if (t <= 0) continue
    const key = sectorKeys[i]
    const purp = purple[key]
    if (purp && APPROX_EQ(t, purp.time) && purp.driverNumber === focusedDriver) {
      out[i] = 'purple'
      continue
    }
    if (dBest && APPROX_EQ(t, dBest[key])) {
      out[i] = 'pb'
    }
  }
  return out as [SectorColor, SectorColor, SectorColor]
}

export function TrackViewport({
  circuit,
  drivers,
  tracks,
  visibleDrivers,
  focusedDriver,
  focusedLaps,
  sectorBests,
  currentLap,
  aggregates,
  currentTimeRef,
  redrawSignal,
}: Props) {
  const driverRefs = useRef<Map<number, CircleHandles>>(new Map())

  const projector = useMemo(() => {
    if (!circuit) return null
    return buildProjector(circuit, { width: VIEWPORT_W, height: VIEWPORT_H, padding: 32 })
  }, [circuit])

  const sectorColors = useMemo(
    () => classifySectors(focusedDriver, focusedLaps, currentLap, sectorBests),
    [focusedDriver, focusedLaps, currentLap, sectorBests],
  )

  // Update inline speed label text content only when current lap changes
  useEffect(() => {
    for (const d of drivers) {
      const handles = driverRefs.current.get(d.driverNumber)
      if (!handles || !handles.speedText) continue
      const agg = aggregates.get(d.driverNumber)?.get(currentLap)
      handles.speedText.textContent = agg ? `${Math.round(agg.avgSpeed)}` : ''
    }
  }, [currentLap, drivers, aggregates])

  // Repaint loop: every redrawSignal change pushes DOM updates from currentTimeRef
  useEffect(() => {
    if (!projector) return
    const t = currentTimeRef.current ?? 0
    for (const d of drivers) {
      const dn = d.driverNumber
      const handles = driverRefs.current.get(dn)
      if (!handles || !handles.circle) continue
      const track = tracks.get(dn)
      const focused = dn === focusedDriver

      if (!visibleDrivers.has(dn) || !track) {
        handles.circle.setAttribute('opacity', '0')
        if (handles.label) handles.label.setAttribute('opacity', '0')
        if (handles.speedText) handles.speedText.setAttribute('opacity', '0')
        continue
      }
      const frame = interpolateFrame(track, t)
      if (!frame.ok) {
        handles.circle.setAttribute('opacity', '0')
        if (handles.label) handles.label.setAttribute('opacity', '0')
        if (handles.speedText) handles.speedText.setAttribute('opacity', '0')
        continue
      }
      const p = projector.project(frame.x, frame.y)
      const r = focused ? 9 : 6
      handles.circle.setAttribute('cx', p.sx.toFixed(1))
      handles.circle.setAttribute('cy', p.sy.toFixed(1))
      handles.circle.setAttribute('r', String(r))
      handles.circle.setAttribute('opacity', frame.status === 2 ? '0.4' : '1')
      // Dark canvas: amber when off-track, white ring when focused, near-bg ring otherwise.
      handles.circle.setAttribute('stroke', frame.status === 1 ? '#F59E0B' : focused ? '#ffffff' : '#0b0d12')
      handles.circle.setAttribute('stroke-width', focused ? '2.5' : '1.5')
      if (handles.label) {
        handles.label.setAttribute('x', p.sx.toFixed(1))
        handles.label.setAttribute('y', (p.sy - r - 3).toFixed(1))
        handles.label.setAttribute('opacity', frame.status === 2 ? '0.4' : '0.95')
      }
      if (handles.speedText) {
        handles.speedText.setAttribute('x', (p.sx + r + 4).toFixed(1))
        handles.speedText.setAttribute('y', (p.sy + 3).toFixed(1))
        handles.speedText.setAttribute('opacity', '0.85')
      }
    }
  }, [redrawSignal, projector, visibleDrivers, tracks, focusedDriver, drivers, currentTimeRef])

  if (!circuit) {
    return (
      <div className="flex h-[460px] w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface">
        <span className="font-mono text-xs text-muted">No circuit geometry available</span>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
      <svg
        viewBox={`0 0 ${VIEWPORT_W} ${VIEWPORT_H}`}
        className="h-[460px] w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <SectorOutline circuit={circuit} viewportW={VIEWPORT_W} viewportH={VIEWPORT_H} sectorColors={sectorColors} />

        {/* Corner labels */}
        {projector &&
          circuit.corners.map((corner) => {
            const p = projector.project(corner.x, corner.y)
            return (
              <g key={`${corner.number}-${corner.letter}`}>
                <circle cx={p.sx} cy={p.sy} r={2} fill="#ff4346" opacity={0.6} />
                <text x={p.sx + 6} y={p.sy + 3} fontSize={9} fill="#8e8e99" fontFamily="monospace">
                  T{corner.number}
                  {corner.letter || ''}
                </text>
              </g>
            )
          })}

        {/* Cars */}
        {drivers.map((d) => {
          const colour = d.teamColour || '#444'
          return (
            <g key={d.driverNumber}>
              <circle
                ref={(el) => {
                  const existing = driverRefs.current.get(d.driverNumber) ?? { circle: null, label: null, speedText: null }
                  existing.circle = el
                  driverRefs.current.set(d.driverNumber, existing)
                }}
                cx={-100}
                cy={-100}
                r={6}
                fill={colour}
                stroke="#0b0d12"
                strokeWidth={1.5}
                opacity={0}
              />
              <text
                ref={(el) => {
                  const existing = driverRefs.current.get(d.driverNumber) ?? { circle: null, label: null, speedText: null }
                  existing.label = el
                  driverRefs.current.set(d.driverNumber, existing)
                }}
                x={-100}
                y={-100}
                fontSize={9}
                fontWeight={700}
                fill={colour}
                textAnchor="middle"
                fontFamily="monospace"
                opacity={0}
                style={{ paintOrder: 'stroke', stroke: '#0b0d12', strokeWidth: 2 }}
              >
                {d.abbreviation || String(d.driverNumber)}
              </text>
              <text
                ref={(el) => {
                  const existing = driverRefs.current.get(d.driverNumber) ?? { circle: null, label: null, speedText: null }
                  existing.speedText = el
                  driverRefs.current.set(d.driverNumber, existing)
                }}
                x={-100}
                y={-100}
                fontSize={8}
                fill="#c7cbd4"
                fontFamily="monospace"
                opacity={0}
                style={{ paintOrder: 'stroke', stroke: '#0b0d12', strokeWidth: 2 }}
              />
            </g>
          )
        })}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
        <span className="bg-bg/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted">
          {circuit.circuitName || circuit.circuitKey}
        </span>
        <span className="bg-bg/70 px-1.5 py-0.5 font-mono text-[9px] text-muted">
          {visibleDrivers.size} car{visibleDrivers.size === 1 ? '' : 's'} on track
          {focusedDriver != null && ` · focus #${focusedDriver}`}
        </span>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-3 bg-bg/70 px-2 py-1">
        <span className="flex items-center gap-1 font-mono text-[9px] text-muted">
          <span className="inline-block h-2 w-2 bg-muted" /> on track
        </span>
        <span className="flex items-center gap-1 font-mono text-[9px] text-muted">
          <span className="inline-block h-2 w-2 bg-muted opacity-40" /> pit
        </span>
        <span className="flex items-center gap-1 font-mono text-[9px] text-muted">
          <span className="inline-block h-2 w-2 border-2 border-amber-500" /> off
        </span>
      </div>
    </div>
  )
}
