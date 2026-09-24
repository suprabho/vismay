/**
 * The Particle Ring from beautiful-headers
 * (packages/core/src/components/ParticleRingLayer.jsx), ported from three.js to
 * plain maths so the edition can draw it on a 2D canvas without shipping three:
 * the same particle generation and the same per-frame orbit, pulse, dispersion,
 * tilt and size-by-distance, seen through the same camera (fov 50 at z = 8).
 * Seeded, so a ring is identical on every render and the server's first-paint
 * dots are stable.
 *
 * Colour is not decided here. Each particle carries a fixed threshold `u`
 * (stratified over [0, 1), then shuffled) and BoomRing paints it boom when `u`
 * falls below the day's boom share, doom otherwise — so the share of green
 * particles is exactly the share of scored stories that were boom.
 */

const CAMERA_Z = 8
const TAN_HALF_FOV = Math.tan((25 * Math.PI) / 180)
/** Half the visible height in world units; ring sizes are fractions of it. */
const MAX_R = CAMERA_Z * TAN_HALF_FOV

export const RING = {
  ringRadius: 0.62,
  ringWidth: 0.1,
  dispersion: 0.14,
  particleSize: 2.1,
  /** beautiful-headers' "Pulse Speed": it scales the whole clock, orbit included. */
  speed: 0.4,
  rotationSpeed: 0.18,
  /** Nearly face-on (90° is a flat circle), so the ring keeps a little depth. */
  tiltX: (78 * Math.PI) / 180,
  /** Pointer tilt at the original's default mouse intensity: ±0.1 rad. */
  pointerTilt: 0.2,
} as const

export interface RingParticle {
  angle: number
  baseRadius: number
  dX: number
  dY: number
  dZ: number
  size: number
  phase: number
  pulseSpeed: number
  /** Boom-coloured while u < the day's boom share. */
  u: number
  /** 0..1 stagger for the intro, when the particles take their colour. */
  delay: number
}

export interface RingView {
  box: number
  size: number
  cosX: number
  sinX: number
  cosZ: number
  sinZ: number
}

export interface RingPoint {
  x: number
  y: number
  r: number
}

/** mulberry32 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The Doom v Boom reading (−1…+1) as the share of scored stories that were boom (0…1). */
export function boomShare(score: number): number {
  return (Math.max(-1, Math.min(1, score)) + 1) / 2
}

/** generateParticles() from ParticleRingLayer.jsx, seeded, plus each particle's threshold and stagger. */
export function ringParticles(count: number, seed: number): RingParticle[] {
  const rnd = seededRandom(seed * 7919 + 101)
  // Stratified thresholds make the boom share exact (round(share · count)
  // particles), not merely likely; shuffling spreads them around the ring.
  const u = Array.from({ length: count }, (_, i) => (i + 0.5) / count)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const swap = u[i]
    u[i] = u[j]
    u[j] = swap
  }
  return u.map((threshold) => ({
    angle: rnd() * Math.PI * 2,
    baseRadius: RING.ringRadius + (rnd() - 0.5) * RING.ringWidth,
    dX: (rnd() - 0.5) * RING.dispersion,
    dY: (rnd() - 0.5) * RING.dispersion,
    dZ: (rnd() - 0.5) * RING.dispersion * 0.3,
    size: 0.5 + rnd() * 0.5,
    phase: rnd() * Math.PI * 2,
    pulseSpeed: 0.5 + rnd(),
    u: threshold,
    delay: rnd(),
  }))
}

/** The camera for one frame, looking at a `box` × `box` square of CSS px. */
export function ringView(box: number, tiltX: number = RING.tiltX, tiltZ = 0): RingView {
  return {
    box,
    // Small boxes need larger particles to stay visible at all.
    size: Math.max(RING.particleSize, 260 / box),
    cosX: Math.cos(tiltX),
    sinX: Math.sin(tiltX),
    cosZ: Math.cos(tiltZ),
    sinZ: Math.sin(tiltZ),
  }
}

/** Where a particle sits at `time`: the useFrame() body, then the camera's projection. Writes into `out`. */
export function placeParticle(p: RingParticle, time: number, v: RingView, out: RingPoint): RingPoint {
  // Orbit at rotationSpeed with a per-particle spread; the radius pulses ±2%.
  const angle = p.angle + time * RING.rotationSpeed * (0.8 + p.pulseSpeed * 0.4)
  const radius = (p.baseRadius + Math.sin(time * p.pulseSpeed + p.phase) * 0.02) * MAX_R
  const lx = Math.cos(angle) * radius + p.dX * MAX_R
  const lz = Math.sin(angle) * radius + p.dZ * MAX_R
  const ly = p.dY * MAX_R * 0.3
  // Particles nearer the centre are drawn larger.
  const distFactor = 1 - Math.min(Math.sqrt(lx * lx + ly * ly + lz * lz) / MAX_R, 1)
  const scale = v.size * p.size * 0.04 * (0.4 + distFactor * 1.2)
  // The ring lies in the XZ plane; its group rotates about z, then about x.
  const rx = lx * v.cosZ - ly * v.sinZ
  const ry = lx * v.sinZ + ly * v.cosZ
  const wy = ry * v.cosX - lz * v.sinX
  const wz = ry * v.sinX + lz * v.cosX
  const f = v.box / 2 / (Math.max(CAMERA_Z - wz, 0.5) * TAN_HALF_FOV)
  out.x = v.box / 2 + rx * f
  out.y = v.box / 2 - wy * f
  out.r = Math.max(0.45, scale * f)
  return out
}

/**
 * The server's first paint: `count` dots on the same ring at time 0, spread
 * evenly around it so a few dozen still read as a ring. Laid out at the
 * desktop ring's 320px and scaled into a 100 × 100 viewBox; rounded, so the
 * markup stays short.
 */
export function ringStaticDots(count: number, seed: number): RingPoint[] {
  const box = 320
  const k = 100 / box
  const view = ringView(box)
  const pt: RingPoint = { x: 0, y: 0, r: 0 }
  return ringParticles(count, seed).map((p, i) => {
    placeParticle({ ...p, angle: ((i + p.delay * 0.8) / count) * Math.PI * 2 }, 0, view, pt)
    return { x: round2(pt.x * k), y: round2(pt.y * k), r: round2(pt.r * k) }
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
