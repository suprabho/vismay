/**
 * Smoothed car motion for the 3D replay.
 *
 * FastF1 position samples arrive every 260–640 ms and individual samples sit
 * a few metres ahead of or behind where the car really was. Interpolating
 * them in a straight line makes every car surge and stall several times a
 * second — sample-to-sample speeds swing 210 ↔ 430 km/h on a straight, and
 * braking/acceleration look random. Motion is therefore split in two:
 *
 *   - WHERE the car is: a Catmull-Rom spline through the raw samples,
 *     parameterised by distance travelled. Positions are only joined smoothly,
 *     never moved, so the racing line keeps its shape through corners.
 *   - WHEN it gets there: distance-vs-time run through a Kalman/RTS smoother
 *     with a constant-acceleration model. Distance, speed and acceleration
 *     come out mutually consistent, so cars brake, turn in and accelerate
 *     like cars while the lap time stays exactly what the data says.
 *
 * Pure math, built once per track; `sample` is two binary searches and a few
 * flops, cheap enough to call for every car every frame.
 */
import type { CarPositionTrack } from '../replay/types'
import { findFrameIndex } from '../replay/trackProjection'

/** Samples further apart than this are a data gap — the smoother restarts. */
const GAP_MS = 2500
/** Gaps longer than this hide the car instead of sliding it across the infield. */
const MAX_BRIDGE_MS = 20_000
/** cos of the sharpest sample-to-sample turn a car can make (~100°). */
const KINK_COS = -0.17
/** A car "behind itself" for longer than this is genuinely reversing (a spin), not stale data. */
const STALE_WINDOW_MS = 4000
/**
 * A sample-to-sample move further than MAX_SPEED_MS·dt + JUMP_SLACK_M is a
 * feed glitch, not driving (the slack absorbs ordinary per-sample noise).
 */
const MAX_SPEED_MS = 100
const JUMP_SLACK_M = 20
/** Steepest real circuit gradient is ~18% (Eau Rouge); never report more. */
const MAX_GRADE = 0.2
const MIN_GRADE_SPAN_M = 4
/** Heading/curvature chord: ± this many metres, or this many seconds of travel. */
const POSE_BASE_M = 4
const POSE_BASE_S = 0.12
/** Along-track position noise of one sample (metres). */
const MEAS_SIGMA_M = 4
/**
 * White-jerk spectral density (m²/s⁵). Sets how quickly the smoothed
 * acceleration may change: high enough to follow a stamp on the brakes, low
 * enough to ignore the per-sample noise.
 */
const JERK_DENSITY = 1000

export interface MotionSample {
  ok: boolean
  /** Track-frame position (raw track units, the same space as frames.x/y/z). */
  x: number
  y: number
  /** Elevation in track units, NaN when the track carries none. */
  z: number
  /** Unit direction of travel in the track frame. */
  dirX: number
  dirY: number
  /** Speed along the path (m/s). */
  speed: number
  /** Longitudinal acceleration (m/s²; negative = braking). */
  accel: number
  /** Signed path curvature (1/m); positive = turning left (counter-clockwise). */
  curvature: number
  /** Elevation gradient dz/ds (rise over run), 0 without elevation. */
  grade: number
  lap: number
  status: number
}

export function emptyMotionSample(): MotionSample {
  return {
    ok: false,
    x: 0,
    y: 0,
    z: Number.NaN,
    dirX: 0,
    dirY: 1,
    speed: 0,
    accel: 0,
    curvature: 0,
    grade: 0,
    lap: 0,
    status: 0,
  }
}

export interface CarMotion {
  readonly driverNumber: number
  /** First / last sample time (ms). */
  readonly t0: number
  readonly tEnd: number
  /** Fill `out` with the car's state at `tMs`; returns `out` (check `out.ok`). */
  sample(tMs: number, out: MotionSample): MotionSample
}

/**
 * Build the smoothed motion model for one car.
 * @param unitsPerMetre track units per metre (Fast-F1 positions are decimetres).
 */
export function buildCarMotion(track: CarPositionTrack, unitsPerMetre = 10): CarMotion {
  const f = track.frames
  const hasZ = !!f.z && f.z.length === f.t.length

  // 1. Strictly increasing timestamps, finite positions, and no stale samples.
  //    The feed occasionally re-sends older positions — one, or a block of
  //    several — which would make the car double back on itself. Drop a
  //    sample that kinks more than ~100° between two real moves (a hairpin
  //    turns ~25° per sample), or that lands behind the last accepted one
  //    along the direction of travel.
  const keep: number[] = []
  let lastT = -Infinity
  const minMove = 3 * unitsPerMetre
  for (let i = 0; i < f.t.length; i++) {
    if (!(f.t[i] > lastT)) continue
    if (!Number.isFinite(f.x[i]) || !Number.isFinite(f.y[i])) continue
    const p = keep.length ? keep[keep.length - 1] : -1
    const nx = i + 1 < f.t.length ? i + 1 : -1
    if (p >= 0 && nx >= 0) {
      const ax = f.x[i] - f.x[p], ay = f.y[i] - f.y[p]
      const bx = f.x[nx] - f.x[i], by = f.y[nx] - f.y[i]
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
      if (la > minMove && lb > minMove && ax * bx + ay * by < KINK_COS * la * lb) continue
    }
    const pp = keep.length > 1 ? keep[keep.length - 2] : -1
    if (pp >= 0 && f.t[i] - f.t[p] < STALE_WINDOW_MS) {
      const dx = f.x[p] - f.x[pp], dy = f.y[p] - f.y[pp]
      const dl = Math.hypot(dx, dy)
      if (dl > minMove && ((f.x[i] - f.x[p]) * dx + (f.y[i] - f.y[p]) * dy) / dl < -minMove) continue
    }
    keep.push(i)
    lastT = f.t[i]
  }
  const n = keep.length
  const tMs = new Float64Array(n)
  const tSec = new Float64Array(n)
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  const pz = new Float64Array(n)
  const lap = new Int32Array(n)
  const status = new Int8Array(n)
  for (let k = 0; k < n; k++) {
    const i = keep[k]
    tMs[k] = f.t[i]
    tSec[k] = (f.t[i] - f.t[keep[0]]) / 1000
    px[k] = f.x[i]
    py[k] = f.y[i]
    lap[k] = f.lap[i] ?? 0
    status[k] = f.status[i] ?? 0
  }
  // Elevation: a light binomial smooth kills the 4 Hz GPS-Z steps.
  if (hasZ) {
    const raw = keep.map((i) => (f.z as number[])[i])
    for (let k = 0; k < n; k++) {
      let acc = 0
      let wsum = 0
      for (let d = -2; d <= 2; d++) {
        const j = k + d
        if (j < 0 || j >= n) continue
        const w = d === 0 ? 6 : Math.abs(d) === 1 ? 4 : 1
        acc += raw[j] * w
        wsum += w
      }
      pz[k] = acc / wsum
    }
  }

  // 2. Distance travelled along the raw polyline (metres).
  const s = new Float64Array(n)
  for (let k = 1; k < n; k++) {
    s[k] = s[k - 1] + Math.hypot(px[k] - px[k - 1], py[k] - py[k - 1]) / unitsPerMetre
  }

  // 3. Smooth distance/speed/acceleration per gap-free run. A sample-to-sample
  //    jump faster than any F1 car (the feed stalling, then catching up) also
  //    ends a run, so the glitch stays a brief dash instead of rippling the
  //    smoothed speed for seconds either side.
  const brk = new Uint8Array(n)
  for (let k = 1; k < n; k++) {
    const dtMs = tMs[k] - tMs[k - 1]
    brk[k] = dtMs > GAP_MS || s[k] - s[k - 1] > (MAX_SPEED_MS * dtMs) / 1000 + JUMP_SLACK_M ? 1 : 0
  }
  const sh = new Float64Array(n)
  const vh = new Float64Array(n)
  const ah = new Float64Array(n)
  let runStart = 0
  for (let k = 1; k <= n; k++) {
    if (k === n || brk[k]) {
      smoothRun(tSec, s, runStart, k - 1, sh, vh, ah)
      runStart = k
    }
  }
  // Cars don't reverse: keep the smoothed distance non-decreasing, inside the
  // raw neighbours' bracket, with non-negative speed.
  for (let k = 0; k < n; k++) {
    const lo = k > 0 ? s[k - 1] : s[k]
    const hi = k + 1 < n ? s[k + 1] : s[k]
    let v = Math.min(Math.max(sh[k], lo), hi)
    if (k > 0 && v < sh[k - 1]) v = sh[k - 1]
    sh[k] = v
    if (vh[k] < 0) vh[k] = 0
  }

  // Catmull-Rom tangents (d position / d distance) at each knot. The height
  // slope uses at least MIN_GRADE_SPAN_M of road and real-circuit limits:
  // with the car crawling, two samples a few cm apart but a GPS-height step
  // apart would otherwise read as a cliff and stand the car on its nose.
  const tx = new Float64Array(n)
  const ty = new Float64Array(n)
  const tz = new Float64Array(n)
  const maxSlope = MAX_GRADE * unitsPerMetre
  for (let k = 0; k < n; k++) {
    const a = k > 0 ? k - 1 : k
    const b = k + 1 < n ? k + 1 : k
    const span = s[b] - s[a]
    if (span > 1e-6) {
      tx[k] = (px[b] - px[a]) / span
      ty[k] = (py[b] - py[a]) / span
    }
    const slope = (pz[b] - pz[a]) / Math.max(span, MIN_GRADE_SPAN_M)
    tz[k] = Math.max(-maxSlope, Math.min(maxSlope, slope))
  }

  const P0 = { x: 0, y: 0, z: 0 }
  const PA = { x: 0, y: 0, z: 0 }
  const PB = { x: 0, y: 0, z: 0 }

  /** Position on the path at distance `dist` (metres), clamped to the data. */
  function positionAt(dist: number, p: { x: number; y: number; z: number }) {
    const d = Math.min(Math.max(dist, 0), s[n - 1])
    let j = findFrameIndexF(s, d)
    if (j < 0) j = 0
    // Skip zero-length (repeated position) segments.
    while (j < n - 2 && s[j + 1] - s[j] < 1e-6) j++
    const h = j < n - 1 ? s[j + 1] - s[j] : 0
    if (h < 1e-6) {
      p.x = px[j]
      p.y = py[j]
      p.z = pz[j]
      return
    }
    const u = Math.min(1, Math.max(0, (d - s[j]) / h))
    const u2 = u * u
    const u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
    p.x = h00 * px[j] + h10 * tx[j] * h + h01 * px[j + 1] + h11 * tx[j + 1] * h
    p.y = h00 * py[j] + h10 * ty[j] * h + h01 * py[j + 1] + h11 * ty[j + 1] * h
    p.z = h00 * pz[j] + h10 * tz[j] * h + h01 * pz[j + 1] + h11 * tz[j + 1] * h
  }

  /**
   * Pose at `dist`: position, plus heading, curvature and gradient measured
   * over a ±`base` metre chord rather than the spline's instantaneous
   * tangent — a single sample a metre off line would otherwise flick the
   * car (and an onboard camera) sideways.
   */
  function poseAt(dist: number, base: number, out: MotionSample) {
    positionAt(dist, P0)
    positionAt(dist - base, PA)
    positionAt(dist + base, PB)
    out.x = P0.x
    out.y = P0.y
    out.z = hasZ ? P0.z : Number.NaN
    const cx = PB.x - PA.x
    const cy = PB.y - PA.y
    const chord = Math.hypot(cx, cy)
    if (chord > 1e-6) {
      out.dirX = cx / chord
      out.dirY = cy / chord
    }
    // Signed Menger curvature through the three points (+ = left / CCW).
    const ax = P0.x - PA.x, ay = P0.y - PA.y
    const bx = PB.x - P0.x, by = PB.y - P0.y
    const denom = Math.hypot(ax, ay) * Math.hypot(bx, by) * chord
    out.curvature = denom > 1e-9 ? ((2 * (ax * by - ay * bx)) / denom) * unitsPerMetre : 0
    out.grade = hasZ && chord > 1e-6 ? Math.max(-MAX_GRADE, Math.min(MAX_GRADE, (PB.z - PA.z) / chord)) : 0
  }

  function sample(t: number, out: MotionSample): MotionSample {
    if (n === 0 || t < tMs[0]) {
      out.ok = false
      return out
    }
    const k = findFrameIndexF(tMs, t)
    out.lap = lap[k]
    out.status = status[k]
    if (k >= n - 1) {
      // Past the last sample: parked where the data ends (finish / DNF).
      poseAt(s[n - 1], POSE_BASE_M, out)
      out.speed = 0
      out.accel = 0
      out.ok = true
      return out
    }
    const hMs = tMs[k + 1] - tMs[k]
    if (hMs > MAX_BRIDGE_MS) {
      out.ok = false
      return out
    }
    const h = hMs / 1000
    const u = (t - tMs[k]) / hMs
    const p0 = sh[k]
    const p1 = sh[k + 1]
    const delta = p1 - p0
    let dist: number
    let v: number
    let a: number
    if (brk[k + 1] || delta <= 1e-6) {
      // Across a data gap, or parked: constant speed, no overshoot.
      dist = p0 + delta * u
      v = delta / h
      a = 0
    } else {
      // Cubic Hermite on the smoothed (distance, speed) knots, tangents
      // limited (Fritsch–Carlson) so distance never runs backwards.
      let m0 = vh[k] * h
      let m1 = vh[k + 1] * h
      const al = m0 / delta
      const be = m1 / delta
      const mag = al * al + be * be
      if (mag > 9) {
        const tau = 3 / Math.sqrt(mag)
        m0 = tau * al * delta
        m1 = tau * be * delta
      }
      const u2 = u * u
      const u3 = u2 * u
      dist = (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1
      v = ((6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * m0 + (-6 * u2 + 6 * u) * p1 + (3 * u2 - 2 * u) * m1) / h
      // Acceleration straight from the smoother (linear between knots) — the
      // Hermite second derivative is only piecewise-linear and noisier.
      a = ah[k] + (ah[k + 1] - ah[k]) * u
    }
    poseAt(dist, Math.max(POSE_BASE_M, Math.max(0, v) * POSE_BASE_S), out)
    out.speed = Math.max(0, v)
    out.accel = a
    out.ok = true
    return out
  }

  return { driverNumber: track.driverNumber, t0: n ? tMs[0] : 0, tEnd: n ? tMs[n - 1] : 0, sample }
}

/** `findFrameIndex` over a typed array. */
function findFrameIndexF(arr: Float64Array, target: number): number {
  return findFrameIndex(arr as unknown as number[], target)
}

/**
 * Rauch–Tung–Striebel smoother over one gap-free run of samples with a
 * constant-acceleration model (white jerk) — in effect a quintic smoothing
 * spline through distance-vs-time. Times in seconds, distances in metres.
 */
function smoothRun(
  t: Float64Array,
  s: Float64Array,
  lo: number,
  hi: number,
  outS: Float64Array,
  outV: Float64Array,
  outA: Float64Array,
): void {
  const m = hi - lo + 1
  if (m === 1) {
    outS[lo] = s[lo]
    outV[lo] = 0
    outA[lo] = 0
    return
  }
  // Filtered and predicted states (3-vector) + covariances (3×3) per step.
  const xf = new Float64Array(m * 3)
  const pf = new Float64Array(m * 9)
  const xp = new Float64Array(m * 3)
  const pp = new Float64Array(m * 9)
  const r = MEAS_SIGMA_M * MEAS_SIGMA_M

  // Initialise from the first two samples under a loose prior.
  let x0 = s[lo]
  let x1 = (s[lo + 1] - s[lo]) / Math.max(1e-3, t[lo + 1] - t[lo])
  let x2 = 0
  let P = [r, 0, 0, 0, 900, 0, 0, 0, 900]
  for (let k = 0; k < m; k++) {
    const i = lo + k
    if (k > 0) {
      const dt = t[i] - t[i - 1]
      x0 = x0 + dt * x1 + 0.5 * dt * dt * x2
      x1 = x1 + dt * x2
      P = predictCov(P, dt)
    }
    xp[k * 3] = x0
    xp[k * 3 + 1] = x1
    xp[k * 3 + 2] = x2
    for (let q = 0; q < 9; q++) pp[k * 9 + q] = P[q]
    // Measurement update, H = [1 0 0].
    const sInov = P[0] + r
    const k0 = P[0] / sInov, k1 = P[3] / sInov, k2 = P[6] / sInov
    const y = s[i] - x0
    x0 += k0 * y
    x1 += k1 * y
    x2 += k2 * y
    const p0 = P[0], p1 = P[1], p2 = P[2]
    P = [
      P[0] - k0 * p0, P[1] - k0 * p1, P[2] - k0 * p2,
      P[3] - k1 * p0, P[4] - k1 * p1, P[5] - k1 * p2,
      P[6] - k2 * p0, P[7] - k2 * p1, P[8] - k2 * p2,
    ]
    xf[k * 3] = x0
    xf[k * 3 + 1] = x1
    xf[k * 3 + 2] = x2
    for (let q = 0; q < 9; q++) pf[k * 9 + q] = P[q]
  }

  // Backward pass: xs_k = xf_k + C (xs_{k+1} − xp_{k+1}), C = Pf_k Fᵀ Pp_{k+1}⁻¹.
  let sx0 = xf[(m - 1) * 3]
  let sx1 = xf[(m - 1) * 3 + 1]
  let sx2 = xf[(m - 1) * 3 + 2]
  outS[hi] = sx0
  outV[hi] = sx1
  outA[hi] = sx2
  const PFt = new Float64Array(9)
  const C = new Float64Array(9)
  for (let k = m - 2; k >= 0; k--) {
    const dt = t[lo + k + 1] - t[lo + k]
    const h = 0.5 * dt * dt
    const o = k * 9
    for (let row = 0; row < 3; row++) {
      const a = pf[o + row * 3], b = pf[o + row * 3 + 1], c = pf[o + row * 3 + 2]
      PFt[row * 3] = a + dt * b + h * c
      PFt[row * 3 + 1] = b + dt * c
      PFt[row * 3 + 2] = c
    }
    const inv = invert3(pp, (k + 1) * 9)
    if (!inv) {
      sx0 = xf[k * 3]
      sx1 = xf[k * 3 + 1]
      sx2 = xf[k * 3 + 2]
    } else {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          C[row * 3 + col] =
            PFt[row * 3] * inv[col] + PFt[row * 3 + 1] * inv[3 + col] + PFt[row * 3 + 2] * inv[6 + col]
        }
      }
      const d0 = sx0 - xp[(k + 1) * 3]
      const d1 = sx1 - xp[(k + 1) * 3 + 1]
      const d2 = sx2 - xp[(k + 1) * 3 + 2]
      sx0 = xf[k * 3] + C[0] * d0 + C[1] * d1 + C[2] * d2
      sx1 = xf[k * 3 + 1] + C[3] * d0 + C[4] * d1 + C[5] * d2
      sx2 = xf[k * 3 + 2] + C[6] * d0 + C[7] * d1 + C[8] * d2
    }
    outS[lo + k] = sx0
    outV[lo + k] = sx1
    outA[lo + k] = sx2
  }
}

/** P' = F P Fᵀ + Q for the constant-acceleration model over `dt` seconds. */
function predictCov(P: number[], dt: number): number[] {
  const h = 0.5 * dt * dt
  const FP = new Array<number>(9)
  for (let col = 0; col < 3; col++) {
    FP[col] = P[col] + dt * P[3 + col] + h * P[6 + col]
    FP[3 + col] = P[3 + col] + dt * P[6 + col]
    FP[6 + col] = P[6 + col]
  }
  const out = new Array<number>(9)
  for (let row = 0; row < 3; row++) {
    const a = FP[row * 3], b = FP[row * 3 + 1], c = FP[row * 3 + 2]
    out[row * 3] = a + dt * b + h * c
    out[row * 3 + 1] = b + dt * c
    out[row * 3 + 2] = c
  }
  const q = JERK_DENSITY
  const d2 = dt * dt, d3 = d2 * dt, d4 = d3 * dt, d5 = d4 * dt
  out[0] += (q * d5) / 20
  out[1] += (q * d4) / 8
  out[2] += (q * d3) / 6
  out[3] += (q * d4) / 8
  out[4] += (q * d3) / 3
  out[5] += (q * d2) / 2
  out[6] += (q * d3) / 6
  out[7] += (q * d2) / 2
  out[8] += q * dt
  return out
}

const INV = new Float64Array(9)

/** Inverse of the 3×3 matrix at `m[o..o+9]` into a shared scratch array. */
function invert3(m: Float64Array, o: number): Float64Array | null {
  const a = m[o], b = m[o + 1], c = m[o + 2]
  const d = m[o + 3], e = m[o + 4], f = m[o + 5]
  const g = m[o + 6], h = m[o + 7], i = m[o + 8]
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const Cc = d * h - e * g
  const det = a * A + b * B + c * Cc
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null
  INV[0] = A / det
  INV[1] = -(b * i - c * h) / det
  INV[2] = (b * f - c * e) / det
  INV[3] = B / det
  INV[4] = (a * i - c * g) / det
  INV[5] = -(a * f - c * d) / det
  INV[6] = Cc / det
  INV[7] = -(a * h - b * g) / det
  INV[8] = (a * e - b * d) / det
  return INV
}
