/**
 * Arc-length index over the circuit outline (world space) plus the trackside
 * "TV" camera positions the camera rig cuts between.
 *
 * Cameras are placed from the geometry alone — corners are found where the
 * outline turns hard, so it works for sessions without corner metadata
 * (the OpenF1 fallback ingest has none). Each corner gets a camera on the
 * outside of the bend; long straights get extra ones, alternating sides.
 */
import * as THREE from 'three'
import type { WorldProjector } from './track3d'

export interface TvCamera {
  position: THREE.Vector3
  /** Outline distance (m) of the stretch this camera covers. */
  anchorS: number
}

export interface CircuitIndex {
  /** Total lap length along the outline (m). */
  length: number
  /**
   * Distance along the outline of the point nearest (x, z). `hint` (last
   * index) keeps the search local; `y` breaks ties where the track crosses
   * over itself (Suzuka's bridge) in favour of the level the car is on.
   */
  locate(x: number, z: number, hint?: number, y?: number): { s: number; index: number }
  /** Road-surface height (world Y) at outline distance `s` — what the ribbon is built on. */
  heightAt(s: number): number
  tvCameras: TvCamera[]
  /** Overview framing: outline points, their centre and bounding radius (world). */
  outline: Array<[number, number, number]>
  center: THREE.Vector3
  radius: number
}

/** Heading change (rad) across ±TURN_WINDOW_M that makes a bend a "corner". */
const CORNER_TURN = 0.5
const TURN_WINDOW_M = 45
const CORNER_SPACING_M = 160
/** Straights longer than this get extra cameras. */
const STRAIGHT_CAM_SPACING_M = 420

export function buildCircuitIndex(projector: WorldProjector, halfWidth: number): CircuitIndex | null {
  const pts = projector.outlineWorld
  const n = pts.length
  if (n < 4) return null

  const S = new Float64Array(n + 1)
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1]
    const b = pts[i % n]
    S[i] = S[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2])
  }
  const length = S[n] || 1

  const box = new THREE.Box3()
  for (const p of pts) box.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]))
  const center = box.getCenter(new THREE.Vector3())
  let radius = 1
  for (const p of pts) radius = Math.max(radius, Math.hypot(p[0] - center.x, p[2] - center.z))

  /** Position + unit tangent at outline distance `s` (wraps). */
  const at = (s: number) => {
    let d = s % length
    if (d < 0) d += length
    let lo = 0
    let hi = n
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1
      if (S[mid] <= d) lo = mid
      else hi = mid
    }
    const a = pts[lo]
    const b = pts[(lo + 1) % n]
    const seg = S[lo + 1] - S[lo] || 1
    const u = (d - S[lo]) / seg
    const tx = (b[0] - a[0]) / seg
    const tz = (b[2] - a[2]) / seg
    return {
      x: a[0] + (b[0] - a[0]) * u,
      y: a[1] + (b[1] - a[1]) * u,
      z: a[2] + (b[2] - a[2]) * u,
      heading: Math.atan2(tx, tz),
    }
  }

  const locate = (x: number, z: number, hint?: number, y?: number) => {
    let best = 0
    let bestD = Infinity
    const scan = (i: number) => {
      const p = pts[((i % n) + n) % n]
      const d = (p[0] - x) ** 2 + (p[2] - z) ** 2 + (y != null ? 4 * (p[1] - y) ** 2 : 0)
      if (d < bestD) {
        bestD = d
        best = ((i % n) + n) % n
      }
    }
    if (hint != null && hint >= 0) {
      for (let k = -25; k <= 25; k++) scan(hint + k)
      // A local hit sits right next to the car; anything further means the
      // hint was stale (seek, pit lane) — fall back to a full scan.
      if (bestD > 60 * 60) for (let i = 0; i < n; i++) scan(i)
    } else {
      for (let i = 0; i < n; i++) scan(i)
    }
    // Project onto the neighbouring segments for a continuous distance.
    let s = S[best]
    for (const j of [best, (best - 1 + n) % n]) {
      const a = pts[j]
      const b = pts[(j + 1) % n]
      const ex = b[0] - a[0]
      const ez = b[2] - a[2]
      const len2 = ex * ex + ez * ez
      if (len2 < 1e-9) continue
      const u = ((x - a[0]) * ex + (z - a[2]) * ez) / len2
      if (u >= 0 && u <= 1) {
        s = S[j] + u * Math.sqrt(len2)
        break
      }
    }
    return { s: s % length, index: best }
  }

  // Corners: peaks of heading change over a ±45 m window, sampled every 10 m.
  const step = 10
  const samples = Math.max(8, Math.floor(length / step))
  const turn = new Float64Array(samples)
  for (let i = 0; i < samples; i++) {
    const s = i * step
    turn[i] = angleDiff(at(s - TURN_WINDOW_M).heading, at(s + TURN_WINDOW_M).heading)
  }
  const corners: Array<{ s: number; turn: number }> = []
  for (let i = 0; i < samples; i++) {
    const v = Math.abs(turn[i])
    if (v < CORNER_TURN) continue
    let peak = true
    for (let k = -3; k <= 3 && peak; k++) {
      if (k !== 0 && Math.abs(turn[(i + k + samples) % samples]) > v) peak = false
    }
    if (!peak) continue
    const s = i * step
    const last = corners[corners.length - 1]
    if (last && s - last.s < CORNER_SPACING_M) {
      if (v > Math.abs(last.turn)) corners[corners.length - 1] = { s, turn: turn[i] }
      continue
    }
    corners.push({ s, turn: turn[i] })
  }
  if (corners.length > 1) {
    const first = corners[0]
    const last = corners[corners.length - 1]
    if (first.s + length - last.s < CORNER_SPACING_M) corners.pop()
  }

  const tvCameras: TvCamera[] = []
  const place = (s: number, side: number, offset: number, height: number) => {
    const p = at(s)
    // Left normal of heading θ is (cosθ, −sinθ).
    const nx = Math.cos(p.heading)
    const nz = -Math.sin(p.heading)
    tvCameras.push({
      position: new THREE.Vector3(p.x + nx * side * offset, p.y + height, p.z + nz * side * offset),
      anchorS: ((s % length) + length) % length,
    })
  }
  corners.forEach((c, i) => {
    // Outside of the bend: right side of a left-hander and vice versa.
    const side = c.turn > 0 ? -1 : 1
    place(c.s, side, halfWidth + 28 + (i % 3) * 8, 7 + (i % 4) * 2.5)
  })
  // Fill long straights (and corner-less tracks).
  const anchors = corners.map((c) => c.s)
  if (anchors.length === 0) anchors.push(0)
  for (let i = 0; i < anchors.length; i++) {
    const from = anchors[i]
    const to = i + 1 < anchors.length ? anchors[i + 1] : anchors[0] + length
    const gap = to - from
    const extra = Math.floor(gap / STRAIGHT_CAM_SPACING_M)
    for (let k = 1; k <= extra; k++) {
      place(from + (gap * k) / (extra + 1), k % 2 ? 1 : -1, halfWidth + 22, 5.5)
    }
  }
  tvCameras.sort((a, b) => a.anchorS - b.anchorS)

  const heightAt = (s: number) => at(s).y

  return { length, locate, heightAt, tvCameras, outline: pts, center, radius }
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * The camera covering a car at outline distance `s`: the next camera ahead,
 * kept until the car is `passBy` metres past it (broadcast-style cut).
 */
export function pickTvCamera(index: CircuitIndex, s: number, passBy = 55): number {
  const cams = index.tvCameras
  if (!cams.length) return -1
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < cams.length; i++) {
    let d = (cams[i].anchorS + passBy - s) % index.length
    if (d < 0) d += index.length
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
