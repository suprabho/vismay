import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds } from '@react-three/drei';
import type { CarPositionTrack, CircuitGeometry, ProcessedLap, SectorBests } from '../../../config/api';
import type { RaceDriver } from '../../../hooks/useRaceData';
import { classifySectors } from '../../../utils/sectorClassification';
import { buildWorldProjector } from '../../../utils/track3d';
import { TrackRibbon } from './TrackRibbon';
import { CarMarkers } from './CarMarkers';
import { CornerMarkers3D } from './CornerMarkers3D';
import { ChaseCamera } from './ChaseCamera';

interface Props {
  circuit:        CircuitGeometry | null;
  drivers:        RaceDriver[];
  tracks:         Map<number, CarPositionTrack>;
  visibleDrivers: Set<number>;
  focusedDriver:  number | null;
  focusedLaps:    ProcessedLap[];
  sectorBests:    SectorBests | null;
  currentLap:     number;
  currentTimeRef: React.RefObject<number>;
  chaseCam:       boolean;
}

export default function TrackViewport3D({
  circuit, drivers, tracks, visibleDrivers, focusedDriver, focusedLaps,
  sectorBests, currentLap, currentTimeRef, chaseCam,
}: Props) {
  const projector = useMemo(() => (circuit ? buildWorldProjector(circuit) : null), [circuit]);

  const sectorColors = useMemo(
    () => classifySectors(focusedDriver, focusedLaps, currentLap, sectorBests),
    [focusedDriver, focusedLaps, currentLap, sectorBests],
  );

  if (!circuit || !projector) {
    return (
      <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center border border-dashed border-neutral-700 bg-neutral-900">
        <span className="font-mono text-xs text-neutral-500">No circuit geometry available</span>
      </div>
    );
  }

  const r = projector.radius;
  const focusTrack = focusedDriver != null ? tracks.get(focusedDriver) ?? null : null;

  return (
    <div className="relative border border-neutral-800 bg-neutral-950 flex-1 w-full h-full min-h-0">
      <Canvas
        className="w-full h-full outline-none"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [r * 0.1, r * 1.4, r * 0.6], fov: 50, near: 0.5, far: r * 40 }}
      >
        <color attach="background" args={['#101216']} />
        <ambientLight intensity={1.0} />
        <directionalLight position={[r, r * 1.5, r * 0.5]} intensity={1.1} />
        {/* Auto-frame the camera to the track box — adapts to any circuit shape
            and canvas aspect (refits on resize), so wide/shallow tracks fill the
            view instead of foreshortening into a thin diagonal. */}
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
          chase={chaseCam && focusTrack != null}
          track={focusTrack}
          projector={projector}
          currentTimeRef={currentTimeRef}
        />
      </Canvas>

      <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 bg-black/50 px-1.5 py-0.5">
          {circuit.circuitName || circuit.circuitKey}
        </span>
        <span className="font-mono text-[9px] text-neutral-500 bg-black/50 px-1.5 py-0.5">
          {projector.hasElevation ? '3D · elevation' : '3D · flat (no elevation data)'}
          {focusedDriver != null && ` · focus #${focusedDriver}`}
        </span>
      </div>
    </div>
  );
}
