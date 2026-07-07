'use client'

import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Bounds } from '@react-three/drei'
import type { CarPositionTrack, CircuitGeometry, ProcessedLap, RaceDriver, SectorBests } from '../replay/types'
import { classifySectors } from './sectorClassification'
import { buildWorldProjector } from './track3d'
import { TrackRibbon } from './TrackRibbon'
import { CarMarkers } from './CarMarkers'
import { CornerMarkers3D } from './CornerMarkers3D'
import { ChaseCamera } from './ChaseCamera'

interface Props {
  circuit: CircuitGeometry | null
  drivers: RaceDriver[]
  tracks: Map<number, CarPositionTrack>
  visibleDrivers: Set<number>
  focusedDriver: number | null
  focusedLaps: ProcessedLap[]
  sectorBests: SectorBests | null
  currentLap: number
  currentTimeRef: React.RefObject<number>
  chaseCam: boolean
  /** Disable OrbitControls + chase cam (capture/print → static framing). */
  interactive?: boolean
  /** Fired once after the first composited frame. */
  onReady?: () => void
}

/** Fires onReady after the first rendered frame so capture waits for paint. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!onReady) return
    const h = requestAnimationFrame(() => onReady())
    return () => cancelAnimationFrame(h)
  }, [onReady, gl])
  return null
}

export function TrackScene3D({
  circuit,
  drivers,
  tracks,
  visibleDrivers,
  focusedDriver,
  focusedLaps,
  sectorBests,
  currentLap,
  currentTimeRef,
  chaseCam,
  interactive = true,
  onReady,
}: Props) {
  const projector = useMemo(() => (circuit ? buildWorldProjector(circuit) : null), [circuit])
  const sectorColors = useMemo(
    () => classifySectors(focusedDriver, focusedLaps, currentLap, sectorBests),
    [focusedDriver, focusedLaps, currentLap, sectorBests],
  )

  useEffect(() => {
    // No circuit → still signal readiness so capture/scroll doesn't hang.
    if ((!circuit || !projector) && onReady) {
      const h = requestAnimationFrame(() => onReady())
      return () => cancelAnimationFrame(h)
    }
  }, [circuit, projector, onReady])

  if (!circuit || !projector) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface">
        <span className="font-mono text-xs text-muted">No circuit geometry available</span>
      </div>
    )
  }

  const r = projector.radius
  // Chase follows the focused car during playback (independent of user orbit).
  // The module disables it for capture to keep a deterministic static framing.
  const chase = chaseCam
  const focusTrack = focusedDriver != null ? tracks.get(focusedDriver) ?? null : null

  return (
    <div className="relative h-full w-full">
      <Canvas
        className="h-full w-full outline-none"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        camera={{ position: [r * 0.1, r * 1.4, r * 0.6], fov: 50, near: 0.5, far: r * 40 }}
      >
        <color attach="background" args={['#101216']} />
        <ambientLight intensity={1.0} />
        <directionalLight position={[r, r * 1.5, r * 0.5]} intensity={1.1} />
        <Bounds fit clip observe margin={1.15}>
          <TrackRibbon circuit={circuit} projector={projector} sectorColors={sectorColors} />
        </Bounds>
        <CornerMarkers3D circuit={circuit} projector={projector} />
        <CarMarkers
          drivers={drivers}
          tracks={tracks}
          visibleDrivers={visibleDrivers}
          focusedDriver={focusedDriver}
          projector={projector}
          currentTimeRef={currentTimeRef}
        />
        <ChaseCamera
          chase={chase && focusTrack != null}
          track={focusTrack}
          projector={projector}
          currentTimeRef={currentTimeRef}
          interactive={interactive}
        />
        <ReadySignal onReady={onReady} />
      </Canvas>

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
        <span className="bg-black/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white/80">
          {circuit.circuitName || circuit.circuitKey}
        </span>
        <span className="bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-white/60">
          {projector.hasElevation ? '3D · elevation' : '3D · flat (no elevation data)'}
          {focusedDriver != null && ` · focus #${focusedDriver}`}
        </span>
      </div>
    </div>
  )
}
