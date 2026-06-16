import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CarPositionTrack } from '../../../config/api';
import type { RaceDriver } from '../../../hooks/useRaceData';
import { interpolateFrame } from '../../../utils/trackProjection';
import type { WorldProjector } from '../../../utils/track3d';

const EMA_ALPHA  = 0.25;  // elevation smoothing — kills 4 Hz GPS-Z steps

interface MarkersProps {
  drivers:        RaceDriver[];
  tracks:         Map<number, CarPositionTrack>;
  visibleDrivers: Set<number>;
  focusedDriver:  number | null;
  projector:      WorldProjector;
  currentTimeRef: React.RefObject<number>;
}

export function CarMarkers({ drivers, tracks, visibleDrivers, focusedDriver, projector, currentTimeRef }: MarkersProps) {
  return (
    <>
      {drivers.map(d => (
        <CarMarker
          key={d.driverNumber}
          driver={d}
          track={tracks.get(d.driverNumber) ?? null}
          visible={visibleDrivers.has(d.driverNumber)}
          focused={d.driverNumber === focusedDriver}
          projector={projector}
          currentTimeRef={currentTimeRef}
        />
      ))}
    </>
  );
}

/** Bake an abbreviation label (team-coloured, dark halo) into a sprite texture once. */
function makeLabelTexture(label: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(label, 64, 32);
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(label, 64, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

interface MarkerProps {
  driver:         RaceDriver;
  track:          CarPositionTrack | null;
  visible:        boolean;
  focused:        boolean;
  projector:      WorldProjector;
  currentTimeRef: React.RefObject<number>;
}

function CarMarker({ driver, track, visible, focused, projector, currentTimeRef }: MarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef   = useRef<THREE.MeshStandardMaterial>(null);
  const ringRef  = useRef<THREE.Mesh>(null);
  const emaY     = useRef<number | null>(null);

  // Marker size scaled to the track so cars are visible at the default framing.
  const carRadius = Math.max(7, projector.radius * 0.013);
  const carLift   = carRadius;
  const color = driver.teamColour || '#9CA3AF';
  const texture = useMemo(
    () => makeLabelTexture(driver.abbreviation || String(driver.driverNumber), color),
    [driver.abbreviation, driver.driverNumber, color],
  );
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!visible || !track) { g.visible = false; return; }

    const t = currentTimeRef.current ?? 0;
    const frame = interpolateFrame(track, t);
    if (!frame.ok) { g.visible = false; return; }
    g.visible = true;

    const [wx, wy, wz] = projector.toWorld(frame.x, frame.y, frame.z);
    const targetY = projector.hasElevation
      ? (frame.z != null ? wy : projector.nearestY(frame.x, frame.y))
      : 0;
    emaY.current = emaY.current == null ? targetY : emaY.current + EMA_ALPHA * (targetY - emaY.current);
    g.position.set(wx, emaY.current + carLift, wz);
    g.scale.setScalar(focused ? 1.6 : 1);

    const inPit = frame.status === 2;
    const off   = frame.status === 1;
    if (matRef.current) matRef.current.opacity = inPit ? 0.4 : 1;
    if (ringRef.current) {
      ringRef.current.visible = focused || off;
      (ringRef.current.material as THREE.MeshBasicMaterial).color.set(off ? '#F59E0B' : '#ffffff');
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <sphereGeometry args={[carRadius, 16, 16]} />
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={focused ? 0.6 : 0.45}
          transparent
        />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[carRadius * 1.7, carRadius * 0.22, 8, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <sprite position={[0, carRadius * 2.8, 0]} scale={[carRadius * 5, carRadius * 2.5, 1]}>
        <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}
