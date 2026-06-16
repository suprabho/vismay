import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CircuitGeometry } from '../../../config/api';
import type { WorldProjector } from '../../../utils/track3d';

interface Props {
  circuit:   CircuitGeometry;
  projector: WorldProjector;
}

function makeCornerTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(label, 48, 24);
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText(label, 48, 24);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** Static corner labels ("T1"…) baked into sprites once per circuit. */
export function CornerMarkers3D({ circuit, projector }: Props) {
  const size = Math.max(20, projector.radius * 0.05);
  const markers = useMemo(() => {
    const lift = Math.max(8, projector.radius * 0.03);
    return circuit.corners.map(corner => {
      const [wx, , wz] = projector.toWorld(corner.x, corner.y);
      const wy = projector.nearestY(corner.x, corner.y);
      return {
        key: `${corner.number}-${corner.letter}`,
        label: `T${corner.number}${corner.letter || ''}`,
        position: [wx, wy + lift, wz] as [number, number, number],
        texture: makeCornerTexture(`T${corner.number}${corner.letter || ''}`),
      };
    });
  }, [circuit, projector]);

  useEffect(() => () => markers.forEach(m => m.texture.dispose()), [markers]);

  return (
    <>
      {markers.map(m => (
        <sprite key={m.key} position={m.position} scale={[size, size * 0.5, 1]}>
          <spriteMaterial map={m.texture} transparent depthTest={false} depthWrite={false} opacity={0.55} />
        </sprite>
      ))}
    </>
  );
}
