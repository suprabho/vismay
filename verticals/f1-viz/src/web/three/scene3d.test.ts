/**
 * 3D replay math checks (run: npx tsx verticals/f1-viz/src/web/three/scene3d.test.ts)
 *
 *   1. carMotion turns jittery ~4 Hz samples into steady speed, brakes and
 *      accelerates believably, never runs backwards, and drops stale samples;
 *   2. carSeparation pushes overlapping cars apart — sideways when side by
 *      side, along the road when nose to tail;
 *   3. circuitIndex finds the corners of a track and cuts TV cameras in order.
 */
import assert from 'node:assert'
import type { CarPositionTrack } from '../replay/types'
import { buildCarMotion, emptyMotionSample } from './carMotion'
import { separateCars, type SeparationBody } from './carSeparation'
import { buildCircuitIndex, pickTvCamera } from './circuitIndex'
import type { WorldProjector } from './track3d'

/** Deterministic PRNG so the jitter is reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function track(t: number[], x: number[], y: number[]): CarPositionTrack {
  return {
    sessionKey: 'test',
    circuitKey: 'test',
    driverNumber: 1,
    sampleRateHz: 4,
    frameCount: t.length,
    t0Ms: t[0],
    tEndMs: t[t.length - 1],
    frames: { t, x, y, lap: t.map(() => 1), status: t.map(() => 0) },
  }
}

// ── 1a. Constant 80 m/s with FastF1-like timing (260–640 ms) and ±5 m along-track noise.
{
  const rand = rng(7)
  const t: number[] = []
  const x: number[] = []
  const y: number[] = []
  let ms = 0
  while (ms < 60_000) {
    t.push(ms)
    const metres = 80 * (ms / 1000) + (rand() - 0.5) * 10
    x.push(metres * 10) // decimetres, straight along +x
    y.push(0)
    ms += 260 + Math.round(rand() * 380)
  }
  const raw: number[] = []
  for (let i = 1; i < t.length; i++) raw.push(((x[i] - x[i - 1]) / 10) / ((t[i] - t[i - 1]) / 1000))
  const rawSpread = Math.max(...raw) - Math.min(...raw)

  const motion = buildCarMotion(track(t, x, y))
  const out = emptyMotionSample()
  let lo = Infinity
  let hi = -Infinity
  let prevX = -Infinity
  for (let q = 5_000; q < 55_000; q += 50) {
    motion.sample(q, out)
    assert.ok(out.ok)
    lo = Math.min(lo, out.speed)
    hi = Math.max(hi, out.speed)
    assert.ok(out.x >= prevX - 1e-6, 'smoothed car never moves backwards')
    prevX = out.x
  }
  assert.ok(rawSpread > 40, `fixture is genuinely noisy (raw spread ${rawSpread.toFixed(1)} m/s)`)
  assert.ok(lo > 74 && hi < 86, `steady 80 m/s survives the jitter (got ${lo.toFixed(1)}–${hi.toFixed(1)})`)
  // Where the car is at a sample time stays close to the data (no drift).
  motion.sample(30_000, out)
  assert.ok(Math.abs(out.x / 10 - 80 * 30) < 8, 'position tracks the data without drift')
}

// ── 1b. Braking: 85 m/s → 25 m/s at 4.5 g, then back up — accel follows, sign right.
{
  const t: number[] = []
  const x: number[] = []
  let pos = 0
  let v = 85
  for (let ms = 0; ms <= 20_000; ms += 300) {
    t.push(ms)
    x.push(pos * 10)
    const a = ms >= 9_000 ? 12 : ms >= 6_000 && v > 25 ? -44 : 0
    for (let k = 0; k < 30; k++) {
      v = Math.max(25, Math.min(85, v + a * 0.01))
      pos += v * 0.01
    }
  }
  const motion = buildCarMotion(track(t, x, x.map(() => 0)))
  const out = emptyMotionSample()
  motion.sample(7_000, out)
  assert.ok(out.accel < -20, `braking reads as strong deceleration (got ${out.accel.toFixed(1)} m/s²)`)
  motion.sample(12_000, out)
  assert.ok(out.accel > 4, `acceleration reads as positive (got ${out.accel.toFixed(1)} m/s²)`)
  motion.sample(3_000, out)
  assert.ok(Math.abs(out.speed - 85) < 3, `cruise speed held (got ${out.speed.toFixed(1)})`)
}

// ── 1c. A stale re-sent sample (path doubling back) is dropped.
{
  const t = [0, 300, 600, 900, 1200, 1500, 1800]
  const x = [0, 240, 480, 300, 960, 1200, 1440] // index 3 is an old position
  const motion = buildCarMotion(track(t, x, x.map(() => 0)))
  const out = emptyMotionSample()
  let prev = -Infinity
  for (let q = 0; q <= 1800; q += 20) {
    motion.sample(q, out)
    assert.ok(out.x >= prev - 1e-6, `no reversal at ${q} ms`)
    prev = out.x
  }
}

// ── 1d. Curvature sign: a counter-clockwise circle is a left turn.
{
  const t: number[] = []
  const x: number[] = []
  const y: number[] = []
  const R = 100 // m
  for (let ms = 0; ms <= 20_000; ms += 250) {
    const a = (ms / 1000) * 0.4 // rad/s → 40 m/s
    t.push(ms)
    x.push(Math.cos(a) * R * 10)
    y.push(Math.sin(a) * R * 10)
  }
  const motion = buildCarMotion(track(t, x, y))
  const out = emptyMotionSample()
  motion.sample(10_000, out)
  assert.ok(Math.abs(out.curvature - 1 / R) < 0.002, `curvature ≈ +1/R (got ${out.curvature.toFixed(4)})`)
  assert.ok(Math.abs(out.speed - 40) < 1.5, `speed on the arc (got ${out.speed.toFixed(1)})`)
}

// ── 2. Separation.
function body(x: number, z: number, id: number): SeparationBody {
  return { x, z, fx: 0, fz: 1, prevOffX: 0, prevOffZ: 0, id, outX: 0, outZ: 0 }
}
function overlaps(a: SeparationBody, b: SeparationBody, L: number, W: number) {
  const dx = Math.abs(b.x + b.outX - (a.x + a.outX))
  const dz = Math.abs(b.z + b.outZ - (a.z + a.outZ))
  return dx < W - 0.05 && dz < L - 0.05
}
{
  const opts = { length: 6.2, width: 2.35, maxOffset: 6 }
  // Side by side, 1 m apart → pushed apart sideways (x), not along (z).
  const a = body(0, 0, 1)
  const b = body(1, 0.5, 2)
  separateCars([a, b], opts)
  assert.ok(!overlaps(a, b, opts.length, opts.width), 'side-by-side pair no longer overlaps')
  assert.ok(Math.abs(a.outZ) < 1e-6 && b.outX > 0 && a.outX < 0, 'resolved sideways, each keeps its side')
  // Nose to tail, 3 m apart → pushed apart along the road.
  const c = body(0, 0, 3)
  const d = body(0.2, 3, 4)
  separateCars([c, d], opts)
  assert.ok(!overlaps(c, d, opts.length, opts.width), 'nose-to-tail pair no longer overlaps')
  assert.ok(d.outZ > 0 && c.outZ < 0, 'resolved along the road, order kept')
  // A queue of five cars stacked on one spot resolves.
  const q = [0, 1, 2, 3, 4].map((i) => body(i * 0.3, i * 0.8, 10 + i))
  separateCars(q, { ...opts, iterations: 12 })
  for (let i = 0; i < q.length; i++) {
    for (let j = i + 1; j < q.length; j++) assert.ok(!overlaps(q[i], q[j], opts.length, opts.width), `queue ${i}/${j} clear`)
  }
  // Far-apart cars are untouched.
  const e = body(0, 0, 20)
  const f = body(0, 50, 21)
  separateCars([e, f], opts)
  assert.ok(e.outX === 0 && e.outZ === 0 && f.outX === 0 && f.outZ === 0, 'no needless nudges')
}

// ── 3. Circuit index on a rounded rectangle: 4 corners, cameras in lap order.
{
  const pts: Array<[number, number, number]> = []
  const add = (x: number, z: number) => pts.push([x, 0, z])
  const W = 800
  const H = 400
  const r = 40
  const arc = (cx: number, cz: number, a0: number) => {
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2)
      add(cx + Math.cos(a) * r, cz + Math.sin(a) * r)
    }
  }
  for (let x = -W / 2 + r; x < W / 2 - r; x += 20) add(x, -H / 2)
  arc(W / 2 - r, -H / 2 + r, -Math.PI / 2)
  for (let z = -H / 2 + r; z < H / 2 - r; z += 20) add(W / 2, z)
  arc(W / 2 - r, H / 2 - r, 0)
  for (let x = W / 2 - r; x > -W / 2 + r; x -= 20) add(x, H / 2)
  arc(-W / 2 + r, H / 2 - r, Math.PI / 2)
  for (let z = H / 2 - r; z > -H / 2 + r; z -= 20) add(-W / 2, z)
  arc(-W / 2 + r, -H / 2 + r, Math.PI)

  const projector = { outlineWorld: pts, radius: 450 } as unknown as WorldProjector
  const index = buildCircuitIndex(projector, 8)
  assert.ok(index)
  const perimeter = 2 * (W - 2 * r) + 2 * (H - 2 * r) + 2 * Math.PI * r
  assert.ok(Math.abs(index.length - perimeter) < 5, `lap length ≈ perimeter (${index.length.toFixed(0)} vs ${perimeter.toFixed(0)})`)
  const cams = index.tvCameras
  assert.ok(cams.length >= 4, `a camera per corner at least (got ${cams.length})`)
  for (let i = 1; i < cams.length; i++) assert.ok(cams[i].anchorS >= cams[i - 1].anchorS, 'cameras sorted by lap distance')
  // Corner cameras sit outside the track, never on it.
  for (const c of cams) {
    const onTrack = pts.some((p) => Math.hypot(p[0] - c.position.x, p[2] - c.position.z) < 8)
    assert.ok(!onTrack, 'camera is off the racing surface')
  }
  // locate() round-trips a point on the outline.
  const hit = index.locate(pts[10][0], pts[10][2])
  assert.ok(hit.index === 10, 'locate finds the nearest outline point')
  // The covering camera is the next one ahead, held until the car passes it.
  const s = cams[1].anchorS - 100
  assert.strictEqual(pickTvCamera(index, s), 1)
  assert.strictEqual(pickTvCamera(index, cams[1].anchorS + 20), 1, 'held just past the camera')
}

console.log('scene3d: all checks passed')
