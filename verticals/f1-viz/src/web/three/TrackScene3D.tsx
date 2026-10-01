'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import type { CarPositionTrack, CircuitGeometry, ProcessedLap, RaceDriver, SectorBests } from '../replay/types'
import { classifySectors } from './sectorClassification'
import { buildWorldProjector, trackHalfWidth } from './track3d'
import { TrackRibbon } from './TrackRibbon'
import { CarMarkers } from './CarMarkers'
import { CornerMarkers3D } from './CornerMarkers3D'
import { CameraRig } from './CameraRig'
import { CameraHud, CameraModeSwitcher, createHudBus } from './CameraControls'
import { RaceLayout } from './RaceLayout'
import { buildCircuitIndex } from './circuitIndex'
import { createRaceState, type CameraMode } from './raceState'

interface Props {
  carModelUrl?: string
  circuit: CircuitGeometry | null
  drivers: RaceDriver[]
  tracks: Map<number, CarPositionTrack>
  visibleDrivers: Set<number>
  focusedDriver: number | null
  focusedLaps: ProcessedLap[]
  sectorBests: SectorBests | null
  currentLap: number
  currentTimeRef: React.RefObject<number>
  /** Initial camera: auto director, onboard POV, chase, trackside TV, helicopter or free orbit. */
  cameraMode: CameraMode
  /** Show the camera picker + HUD (defaults to `interactive`). */
  cameraControls?: boolean
  /** Disable OrbitControls (capture/print → static framing). */
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
  carModelUrl,
  circuit,
  drivers,
  tracks,
  visibleDrivers,
  focusedDriver,
  focusedLaps,
  sectorBests,
  currentLap,
  currentTimeRef,
  cameraMode,
  cameraControls,
  interactive = true,
  onReady,
}: Props) {
  const projector = useMemo(() => (circuit ? buildWorldProjector(circuit) : null), [circuit])
  const circuitIndex = useMemo(
    () => (projector ? buildCircuitIndex(projector, trackHalfWidth(projector)) : null),
    [projector],
  )
  const sectorColors = useMemo(
    () => classifySectors(focusedDriver, focusedLaps, currentLap, sectorBests),
    [focusedDriver, focusedLaps, currentLap, sectorBests],
  )
  const driverNumbers = useMemo(() => drivers.map((d) => d.driverNumber).join(','), [drivers])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const raceState = useMemo(() => createRaceState(drivers.map((d) => d.driverNumber)), [driverNumbers])

  const [mode, setMode] = useState<CameraMode>(cameraMode)
  useEffect(() => setMode(cameraMode), [cameraMode])
  const hudBus = useMemo(() => createHudBus(), [])
  const onHud = useCallback((info: Parameters<typeof hudBus.emit>[0]) => hudBus.emit(info), [hudBus])
  const showControls = cameraControls ?? interactive

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
  const follow = mode !== 'orbit'
  const grid = follow
    ? { cell: 5, section: 50, fade: 700 }
    : { cell: Math.max(25, Math.round(r / 40)), section: Math.max(250, Math.round(r / 4)), fade: r * 4 }

  return (
    <div className="relative h-full w-full">
      <Canvas
        className="h-full w-full outline-none"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        camera={{ position: [r * 0.1, r * 1.4, r * 0.6], fov: 50, near: 0.5, far: r * 40 }}
      >
        <color attach="background" args={['#101216']} />
        <fog attach="fog" args={['#101216', follow ? 900 : r * 30, follow ? 2600 : r * 60]} />
        <ambientLight intensity={1.0} />
        <directionalLight position={[r, r * 1.5, r * 0.5]} intensity={1.1} />
        <Grid
          position={[0, -2, 0]}
          infiniteGrid
          followCamera
          cellSize={grid.cell}
          sectionSize={grid.section}
          fadeDistance={grid.fade}
          fadeStrength={1.6}
          cellThickness={0.6}
          sectionThickness={1}
          cellColor="#1b1f27"
          sectionColor="#272c37"
        />
        <TrackRibbon circuit={circuit} projector={projector} sectorColors={sectorColors} closeUp={follow} />
        <CornerMarkers3D circuit={circuit} projector={projector} chase={follow} />
        <RaceLayout
          tracks={tracks}
          visibleDrivers={visibleDrivers}
          projector={projector}
          circuit={circuitIndex}
          currentTimeRef={currentTimeRef}
          state={raceState}
        />
        <CarMarkers modelUrl={carModelUrl} drivers={drivers} focusedDriver={focusedDriver} state={raceState} />
        <CameraRig
          mode={mode}
          focusedDriver={focusedDriver}
          state={raceState}
          circuit={circuitIndex}
          modelUrl={carModelUrl}
          drivers={drivers}
          interactive={interactive}
          onHud={showControls ? onHud : undefined}
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
      {showControls && (
        <>
          <div className="absolute right-3 top-3">
            <CameraModeSwitcher mode={mode} onChange={setMode} />
          </div>
          <div className="absolute bottom-3 left-3">
            <CameraHud bus={hudBus} />
          </div>
        </>
      )}
    </div>
  )
}
