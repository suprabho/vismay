import { useRef, type ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CarPositionTrack } from '../../../config/api';
import { interpolateFrame } from '../../../utils/trackProjection';
import type { WorldProjector } from '../../../utils/track3d';

interface Props {
  chase:          boolean;
  track:          CarPositionTrack | null;
  projector:      WorldProjector;
  currentTimeRef: React.RefObject<number>;
}

const TMP_TARGET = new THREE.Vector3();
const TMP_CAM    = new THREE.Vector3();

/**
 * Orbit controls by default. When chase mode is on and a driver is focused, the
 * camera eases to a trailing follow position derived from the car's heading.
 */
export function ChaseCamera({ chase, track, projector, currentTimeRef }: Props) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!chase || !track || !controls.current) return;
    const t = currentTimeRef.current ?? 0;
    const f = interpolateFrame(track, t);
    if (!f.ok) return;

    const [wx, wy, wz] = projector.toWorld(f.x, f.y, f.z);
    // Heading from a frame slightly ahead in time.
    const ahead = interpolateFrame(track, t + 300);
    let hx = 0;
    let hz = 1;
    if (ahead.ok) {
      const [ax, , az] = projector.toWorld(ahead.x, ahead.y, ahead.z);
      hx = ax - wx;
      hz = az - wz;
      const len = Math.hypot(hx, hz) || 1;
      hx /= len;
      hz /= len;
    }
    TMP_CAM.set(wx - hx * 30, wy + 14, wz - hz * 30);
    TMP_TARGET.set(wx, wy + 1.5, wz);
    camera.position.lerp(TMP_CAM, 0.08);
    controls.current.target.lerp(TMP_TARGET, 0.12);
    controls.current.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!chase}
      enablePan={!chase}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={10}
      dampingFactor={0.1}
    />
  );
}
