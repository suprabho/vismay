import type { CircuitGeometry } from '../config/api';

/** Fast-F1 position coords are in 1/10 metre units. */
const UNIT = 10;
/** Vertical scale applied to elevation — true-scale reads almost flat on most tracks. */
export const Z_EXAGGERATION = 2;

export interface WorldProjector {
  /** Map Fast-F1 track coords (+ optional elevation) into three.js world space (metres, Y up). */
  toWorld: (x: number, y: number, z?: number) => [number, number, number];
  /** True when the circuit carries an elevation polyline. */
  hasElevation: boolean;
  /** Nearest outline elevation (world Y) for a track coord — fallback when a frame lacks z. */
  nearestY: (x: number, y: number) => number;
  /** Outline points already projected to world space (ribbon + corner building). */
  outlineWorld: Array<[number, number, number]>;
  /** Approximate track radius in world units, for camera framing. */
  radius: number;
}

/**
 * Build a shared world-space projector for the 3D race view. Mirrors the 2D
 * projector's rotation/recentre so both views agree on orientation, but maps onto
 * the XZ ground plane with Y as (exaggerated) elevation.
 */
export function buildWorldProjector(circuit: CircuitGeometry): WorldProjector {
  const ox = circuit.outline.x;
  const oy = circuit.outline.y;
  const oz = circuit.outline.z;
  const hasElevation = !!oz && oz.length === ox.length && oz.length > 0;

  const bounds = circuit.bounds ?? {
    minX: ox.length ? Math.min(...ox) : 0,
    maxX: ox.length ? Math.max(...ox) : 1,
    minY: oy.length ? Math.min(...oy) : 0,
    maxY: oy.length ? Math.max(...oy) : 1,
  };
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const theta = (circuit.rotationDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const minZ = hasElevation ? Math.min(...(oz as number[])) : 0;

  const toWorld = (x: number, y: number, z?: number): [number, number, number] => {
    const dx = x - cx;
    const dy = y - cy;
    const rx = dx * cosT - dy * sinT;
    const ry = dx * sinT + dy * cosT;
    const wy = z != null && hasElevation ? ((z - minZ) / UNIT) * Z_EXAGGERATION : 0;
    return [rx / UNIT, wy, -ry / UNIT];
  };

  const outlineWorld: Array<[number, number, number]> = [];
  for (let i = 0; i < ox.length; i++) {
    outlineWorld.push(toWorld(ox[i], oy[i], hasElevation ? (oz as number[])[i] : undefined));
  }

  const nearestY = (x: number, y: number): number => {
    if (!hasElevation || outlineWorld.length === 0) return 0;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < ox.length; i++) {
      const dx = ox[i] - x;
      const dy = oy[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    return outlineWorld[best][1];
  };

  const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / UNIT / 2 || 60;

  return { toWorld, hasElevation, nearestY, outlineWorld, radius };
}
