import type { CarPositionTrack, CircuitGeometry } from '../config/api';

export interface Viewport { width: number; height: number; padding?: number; }
export interface ProjectedPoint { sx: number; sy: number; }

export interface Projector {
  project: (x: number, y: number) => ProjectedPoint;
  outlinePath: string;
}

/**
 * Build a memoizable projector that maps Fast-F1 track coords (raw meters) into
 * the SVG viewport. Rotation is applied around the bounds center, then translated
 * so (minX, minY) → (0, 0), then uniformly scaled to fit the viewport while
 * preserving aspect ratio.
 *
 * Fast-F1 convention: positive Y points "north" in the track frame. SVG Y points
 * down. We invert Y after rotation so the rendered track is right-side up.
 */
export function buildProjector(circuit: CircuitGeometry, viewport: Viewport): Projector {
  const pad = viewport.padding ?? 24;
  const bounds = circuit.bounds ?? deriveBounds(circuit.outline.x, circuit.outline.y);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const theta = (circuit.rotationDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Rotate bounds corners so we know the post-rotation extent
  const rotatedCorners = [
    rotate(bounds.minX, bounds.minY),
    rotate(bounds.maxX, bounds.minY),
    rotate(bounds.maxX, bounds.maxY),
    rotate(bounds.minX, bounds.maxY),
  ];
  const rxs = rotatedCorners.map(p => p.x);
  const rys = rotatedCorners.map(p => p.y);
  const rMinX = Math.min(...rxs);
  const rMaxX = Math.max(...rxs);
  const rMinY = Math.min(...rys);
  const rMaxY = Math.max(...rys);

  const trackW = rMaxX - rMinX || 1;
  const trackH = rMaxY - rMinY || 1;
  const sx = (viewport.width  - pad * 2) / trackW;
  const sy = (viewport.height - pad * 2) / trackH;
  const scale = Math.min(sx, sy);
  // Center within viewport
  const offsetX = (viewport.width  - trackW * scale) / 2;
  const offsetY = (viewport.height - trackH * scale) / 2;

  function rotate(x: number, y: number) {
    const dx = x - cx;
    const dy = y - cy;
    return { x: dx * cosT - dy * sinT, y: dx * sinT + dy * cosT };
  }

  function project(x: number, y: number): ProjectedPoint {
    const r = rotate(x, y);
    // Flip Y so SVG Y-down → world Y-up renders correctly
    const sxOut = offsetX + (r.x - rMinX) * scale;
    const syOut = offsetY + (rMaxY - r.y) * scale;
    return { sx: sxOut, sy: syOut };
  }

  // Pre-compute outline path
  let outlinePath = '';
  const ox = circuit.outline.x;
  const oy = circuit.outline.y;
  if (ox.length > 0 && oy.length === ox.length) {
    const parts: string[] = [];
    for (let i = 0; i < ox.length; i++) {
      const p = project(ox[i], oy[i]);
      parts.push(`${i === 0 ? 'M' : 'L'}${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`);
    }
    parts.push('Z');
    outlinePath = parts.join(' ');
  }

  return { project, outlinePath };
}

function deriveBounds(xs: number[], ys: number[]) {
  return {
    minX: xs.length ? Math.min(...xs) : 0,
    maxX: xs.length ? Math.max(...xs) : 1,
    minY: ys.length ? Math.min(...ys) : 0,
    maxY: ys.length ? Math.max(...ys) : 1,
  };
}

/**
 * Binary search for the largest index i such that t[i] <= target.
 * Returns -1 if target is before t[0], or t.length - 1 if after the end.
 */
export function findFrameIndex(t: number[], target: number): number {
  if (t.length === 0) return -1;
  if (target < t[0]) return -1;
  if (target >= t[t.length - 1]) return t.length - 1;
  let lo = 0;
  let hi = t.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (t[mid] <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface InterpolatedFrame {
  x:      number;
  y:      number;
  lap:    number;
  status: number;
  ok:     boolean;
}

/**
 * Linearly interpolate a driver's position at an arbitrary time. Returns ok=false
 * when target lies outside the driver's track window (e.g. they DNF'd early).
 */
export function interpolateFrame(track: CarPositionTrack, targetMs: number): InterpolatedFrame {
  const { frames } = track;
  const idx = findFrameIndex(frames.t, targetMs);
  if (idx < 0 || idx >= frames.t.length - 1) {
    if (idx < 0) return { x: 0, y: 0, lap: 0, status: 0, ok: false };
    return {
      x:      frames.x[idx],
      y:      frames.y[idx],
      lap:    frames.lap[idx],
      status: frames.status[idx],
      ok:     true,
    };
  }
  const t0 = frames.t[idx];
  const t1 = frames.t[idx + 1];
  const span = t1 - t0;
  const u = span > 0 ? (targetMs - t0) / span : 0;
  return {
    x:      frames.x[idx] + (frames.x[idx + 1] - frames.x[idx]) * u,
    y:      frames.y[idx] + (frames.y[idx + 1] - frames.y[idx]) * u,
    lap:    frames.lap[idx],
    status: frames.status[idx],
    ok:     true,
  };
}

/**
 * Find the t (ms) at the first frame whose lap is >= target. Used by lap scrubber
 * to jump playback to a lap boundary.
 */
export function timeAtLapStart(track: CarPositionTrack, lap: number): number | null {
  const laps = track.frames.lap;
  for (let i = 0; i < laps.length; i++) {
    if (laps[i] >= lap) return track.frames.t[i];
  }
  return null;
}

/**
 * Compute ordinal race positions at time T.
 *
 * Sort key per driver: (laps completed desc, distance-along-lap desc). Lap count
 * comes from car_positions frames; lap progress is the index of the nearest
 * point on the circuit outline (sequential polyline sampled along the fastest
 * lap, same coord space as frames.x/y). Drivers without a frame at the target
 * time get position +Infinity.
 */
export function computeLiveStandings(
  tracks:   Map<number, CarPositionTrack>,
  targetMs: number,
  circuit:  CircuitGeometry | null,
): Map<number, number> {
  const ox = circuit?.outline.x ?? [];
  const oy = circuit?.outline.y ?? [];
  const hasOutline = ox.length > 1 && oy.length === ox.length;

  const keys: Array<{ dn: number; lap: number; progress: number; alive: boolean }> = [];
  for (const [dn, track] of tracks) {
    const idx = findFrameIndex(track.frames.t, targetMs);
    if (idx < 0) {
      keys.push({ dn, lap: -Infinity, progress: -Infinity, alive: false });
      continue;
    }
    const lap = track.frames.lap[idx] ?? 0;
    let progress = idx;
    if (hasOutline) {
      const x = track.frames.x[idx];
      const y = track.frames.y[idx];
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < ox.length; i++) {
        const dx = ox[i] - x;
        const dy = oy[i] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = i; }
      }
      progress = best;
    }
    keys.push({ dn, lap, progress, alive: true });
  }
  keys.sort((a, b) => {
    if (b.lap !== a.lap) return b.lap - a.lap;
    return b.progress - a.progress;
  });
  const out = new Map<number, number>();
  keys.forEach((k, i) => {
    out.set(k.dn, k.alive ? i + 1 : Infinity);
  });
  return out;
}

export function formatRaceTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}
