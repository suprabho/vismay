/**
 * Live (playhead-time) telemetry for the focused-driver card, derived from the
 * position tracks alone so it works for every session — fixtures included.
 *
 * - Speed: chord length between interpolated positions either side of the
 *   playhead, divided by the window.
 * - Gap ahead: each car's race distance (laps × lap length + distance along
 *   the outline) is unwrapped once per track and cached. The interval is how
 *   long ago the car ahead was where the focused car is now — the same
 *   definition broadcast timing uses — and the distance gap falls out too.
 *
 * Per-lap aggregates can't do this: OpenF1 ingests no metre gap at all, so the
 * stored `min_gap_to_ahead_m` is null (and used to surface as "0 m").
 */
import type { CarPositionTrack, CircuitGeometry } from './types'
import { computeLiveStandings, findFrameIndex, interpolateFrame } from './trackProjection'

interface OutlineIndex {
  x: number[]
  y: number[]
  /** Cumulative distance (m) along the outline at each point. */
  cum: Float64Array
  lapLen: number
}

const outlineCache = new WeakMap<CircuitGeometry, OutlineIndex | null>()

function outlineIndex(circuit: CircuitGeometry | null): OutlineIndex | null {
  if (!circuit) return null
  const cached = outlineCache.get(circuit)
  if (cached !== undefined) return cached
  const { x, y } = circuit.outline
  let out: OutlineIndex | null = null
  if (x.length > 1 && y.length === x.length) {
    const cum = new Float64Array(x.length)
    for (let i = 1; i < x.length; i++) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1])
    const closing = Math.hypot(x[0] - x[x.length - 1], y[0] - y[y.length - 1])
    const lapLen = cum[x.length - 1] + closing
    if (lapLen > 0) out = { x, y, cum, lapLen }
  }
  outlineCache.set(circuit, out)
  return out
}

/** Outline points searched either side of the previous match before a full scan. */
const SEARCH_WINDOW = 40
/** A windowed match further than this (m) from the car falls back to a full scan. */
const RESCAN_DIST_M = 60

function nearestOutlineIndex(o: OutlineIndex, px: number, py: number, hint: number): number {
  const n = o.x.length
  let best = -1
  let bestD = Infinity
  if (hint >= 0) {
    for (let k = -SEARCH_WINDOW; k <= SEARCH_WINDOW; k++) {
      const i = (((hint + k) % n) + n) % n
      const d = (o.x[i] - px) ** 2 + (o.y[i] - py) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (bestD <= RESCAN_DIST_M ** 2) return best
  }
  for (let i = 0; i < n; i++) {
    const d = (o.x[i] - px) ** 2 + (o.y[i] - py) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

const progressCache = new WeakMap<CarPositionTrack, { circuit: CircuitGeometry; p: Float64Array }>()

/**
 * Race distance (m) at every frame, made non-decreasing so it can be binary
 * searched. Outline distance is unwrapped into a continuous odometer, then
 * anchored wherever the lap counter ticks over: the counter supplies the whole
 * laps, the car's spot on the outline supplies the metres (median across
 * crossings). Position, not tick timing, sets the metres, so every car lands
 * on the same scale even when counters tick a little early or late.
 */
function raceProgress(track: CarPositionTrack, circuit: CircuitGeometry | null): Float64Array | null {
  const o = outlineIndex(circuit)
  if (!o || !circuit) return null
  const cached = progressCache.get(track)
  if (cached && cached.circuit === circuit) return cached.p

  const { x, y, lap } = track.frames
  const n = track.frames.t.length
  const raw = new Float64Array(n)
  const half = o.lapLen / 2
  const offsets: number[] = []
  let hint = -1
  let prevArc = 0
  for (let i = 0; i < n; i++) {
    hint = nearestOutlineIndex(o, x[i], y[i], hint)
    const arc = o.cum[hint]
    if (i === 0) {
      raw[0] = arc
    } else {
      let d = arc - prevArc
      if (d > half) d -= o.lapLen
      else if (d < -half) d += o.lapLen
      raw[i] = raw[i - 1] + d
      if (lap[i] > lap[i - 1]) {
        // Just past the outline start reads as a little into lap `lap[i]`.
        const intoLap = arc > half ? arc - o.lapLen : arc
        offsets.push((lap[i] - 1) * o.lapLen + intoLap - raw[i])
      }
    }
    prevArc = arc
  }

  let offset = (Math.max(1, lap[0] ?? 1) - 1) * o.lapLen
  if (offsets.length) {
    offsets.sort((a, b) => a - b)
    offset = offsets[offsets.length >> 1]
  }
  const p = new Float64Array(n)
  for (let i = 0; i < n; i++) p[i] = i === 0 ? raw[0] + offset : Math.max(p[i - 1], raw[i] + offset)
  progressCache.set(track, { circuit, p })
  return p
}

function progressAt(track: CarPositionTrack, p: Float64Array, tMs: number): number | null {
  const t = track.frames.t
  const idx = findFrameIndex(t, tMs)
  if (idx < 0) return null
  if (idx >= t.length - 1) return p[idx]
  const span = t[idx + 1] - t[idx]
  const u = span > 0 ? (tMs - t[idx]) / span : 0
  return p[idx] + (p[idx + 1] - p[idx]) * u
}

/** Time (ms) the track reached race distance `target`, or null outside its history. */
function timeAtProgress(track: CarPositionTrack, p: Float64Array, target: number): number | null {
  const n = p.length
  if (n === 0 || target > p[n - 1] || target < p[0]) return null
  let lo = 0
  let hi = n - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1
    if (p[mid] < target) lo = mid
    else hi = mid
  }
  const span = p[hi] - p[lo]
  const u = span > 0 ? (target - p[lo]) / span : 0
  const t = track.frames.t
  return t[lo] + (t[hi] - t[lo]) * u
}

/**
 * Ordinal race positions at `tMs` by interpolated race distance — the same
 * scale `gapToCarAhead` measures, so position and gap never disagree. Falls
 * back to the lap + nearest-outline-point ordering without an outline.
 */
export function computeLiveStandingsByDistance(
  tracks: Map<number, CarPositionTrack>,
  tMs: number,
  circuit: CircuitGeometry | null,
): Map<number, number> {
  if (!outlineIndex(circuit)) return computeLiveStandings(tracks, tMs, circuit)
  const keys: Array<{ dn: number; dist: number }> = []
  for (const [dn, track] of tracks) {
    const p = raceProgress(track, circuit)
    const dist = p ? progressAt(track, p, tMs) : null
    keys.push({ dn, dist: dist ?? -Infinity })
  }
  keys.sort((a, b) => b.dist - a.dist)
  const out = new Map<number, number>()
  keys.forEach((k, i) => out.set(k.dn, Number.isFinite(k.dist) ? i + 1 : Infinity))
  return out
}

/** Half-width (ms) of the window speed is measured over. */
const SPEED_HALF_WINDOW_MS = 500

/** Instantaneous speed (km/h) at `tMs`, or null outside the car's window. */
export function speedAt(track: CarPositionTrack, tMs: number): number | null {
  const t = track.frames.t
  if (t.length < 2) return null
  const a = Math.max(t[0], tMs - SPEED_HALF_WINDOW_MS)
  const b = Math.min(t[t.length - 1], tMs + SPEED_HALF_WINDOW_MS)
  if (b - a < 1 || tMs < t[0] || tMs > t[t.length - 1]) return null
  const fa = interpolateFrame(track, a)
  const fb = interpolateFrame(track, b)
  if (!fa.ok || !fb.ok) return null
  const metres = Math.hypot(fb.x - fa.x, fb.y - fa.y)
  return (metres / ((b - a) / 1000)) * 3.6
}

/** Speed samples (km/h) over the `windowMs` leading up to `tMs`, oldest first. */
export function speedHistory(track: CarPositionTrack, tMs: number, windowMs = 10_000, samples = 20): number[] {
  const out: number[] = []
  const step = windowMs / (samples - 1)
  for (let i = samples - 1; i >= 0; i--) {
    const v = speedAt(track, tMs - i * step)
    if (v != null) out.push(v)
  }
  return out
}

export type LiveGap =
  | { kind: 'leader' }
  | { kind: 'gap'; aheadDriver: number; seconds: number | null; metres: number | null }
  | { kind: 'none' }

/**
 * Interval to the car one place ahead in `standings` at `tMs`: seconds since
 * that car was at the focused car's current race distance, plus the distance
 * between them.
 */
export function gapToCarAhead(
  tracks: Map<number, CarPositionTrack>,
  circuit: CircuitGeometry | null,
  driverNumber: number,
  standings: Map<number, number>,
  tMs: number,
): LiveGap {
  const pos = standings.get(driverNumber)
  if (pos == null || !Number.isFinite(pos)) return { kind: 'none' }
  if (pos === 1) return { kind: 'leader' }

  let aheadDriver: number | null = null
  for (const [dn, p] of standings) {
    if (p === pos - 1) {
      aheadDriver = dn
      break
    }
  }
  const self = tracks.get(driverNumber)
  const ahead = aheadDriver != null ? tracks.get(aheadDriver) : undefined
  if (aheadDriver == null || !self || !ahead) return { kind: 'none' }

  const ps = raceProgress(self, circuit)
  const pa = raceProgress(ahead, circuit)
  if (!ps || !pa) return { kind: 'gap', aheadDriver, seconds: null, metres: null }

  const selfDist = progressAt(self, ps, tMs)
  const aheadDist = progressAt(ahead, pa, tMs)
  if (selfDist == null || aheadDist == null) return { kind: 'gap', aheadDriver, seconds: null, metres: null }

  const metres = Math.max(0, aheadDist - selfDist)
  const passedAt = timeAtProgress(ahead, pa, selfDist)
  let seconds = passedAt != null && passedAt <= tMs ? (tMs - passedAt) / 1000 : null
  if (seconds == null) {
    // The car ahead's history doesn't reach back that far (e.g. the start):
    // estimate from distance at the focused car's current speed.
    const kmh = speedAt(self, tMs)
    if (kmh != null && kmh > 10) seconds = metres / (kmh / 3.6)
  }
  return { kind: 'gap', aheadDriver, seconds, metres }
}
