/**
 * Keep car bodies from intersecting.
 *
 * Telemetry positions are accurate to a few metres, so two cars racing wheel
 * to wheel, queueing on the grid or nose-to-tail down a straight regularly
 * land inside each other. Each car is treated as a box (length × width)
 * aligned to its heading; overlapping pairs are pushed apart along whichever
 * axis needs the smaller move (biased to keep in-line cars in line) —
 * sideways for side-by-side cars, along the road for nose-to-tail ones — a
 * few relaxation passes deep, so a whole queue resolves. Pure; the caller
 * smooths the resulting offsets over time.
 */

export interface SeparationBody {
  /** Telemetry position (world XZ). */
  x: number
  z: number
  /** Unit heading (world XZ). */
  fx: number
  fz: number
  /** Previous smoothed offset — breaks ties so cars keep the side they're on. */
  prevOffX: number
  prevOffZ: number
  /** Stable tie-break when two cars sit exactly on top of each other. */
  id: number
  /** Output: target offset to apply (world XZ). */
  outX: number
  outZ: number
}

export interface SeparationOptions {
  /** Box length / width including the gap to keep (metres). */
  length: number
  width: number
  /** Upper bound on any single car's displacement (metres). */
  maxOffset: number
  iterations?: number
}

/** Sideways resolution must be this much smaller than along-track to win. */
const LATERAL_BIAS = 0.6

export function separateCars(bodies: SeparationBody[], opts: SeparationOptions): void {
  const { length: L, width: W, maxOffset } = opts
  const iterations = opts.iterations ?? 6
  const n = bodies.length
  for (const b of bodies) {
    b.outX = 0
    b.outZ = 0
  }
  if (n < 2) return
  const reach = Math.hypot(L, W)
  for (let it = 0; it < iterations; it++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      const a = bodies[i]
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j]
        const dx = b.x + b.outX - (a.x + a.outX)
        const dz = b.z + b.outZ - (a.z + a.outZ)
        if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue
        // Shared frame: the pair's mean heading (falls back to a's when opposed).
        let fx = a.fx + b.fx
        let fz = a.fz + b.fz
        let fl = Math.hypot(fx, fz)
        if (fl < 1e-3) {
          fx = a.fx
          fz = a.fz
          fl = Math.hypot(fx, fz) || 1
        }
        fx /= fl
        fz /= fl
        // Left normal of heading (sinθ, cosθ) is (cosθ, −sinθ) = (fz, −fx).
        const lx = fz
        const lz = -fx
        const along = dx * fx + dz * fz
        const across = dx * lx + dz * lz
        const penAlong = L - Math.abs(along)
        const penAcross = W - Math.abs(across)
        if (penAlong <= 0 || penAcross <= 0) continue
        moved = true
        let px: number
        let pz: number
        // Prefer keeping in-line cars in line (a DRS train shouldn't look like
        // a pass): only go sideways when that's clearly the smaller move —
        // unless the first passes couldn't untangle a tight pack.
        if (penAcross <= penAlong * (it < iterations / 2 ? LATERAL_BIAS : 1)) {
          let side = Math.sign(across)
          if (Math.abs(across) < 1e-3) {
            const prev = (b.prevOffX - a.prevOffX) * lx + (b.prevOffZ - a.prevOffZ) * lz
            side = Math.abs(prev) > 1e-3 ? Math.sign(prev) : b.id > a.id ? 1 : -1
          }
          const push = (penAcross / 2) * side
          px = lx * push
          pz = lz * push
        } else {
          let side = Math.sign(along)
          if (Math.abs(along) < 1e-3) side = b.id > a.id ? 1 : -1
          const push = (penAlong / 2) * side
          px = fx * push
          pz = fz * push
        }
        a.outX -= px
        a.outZ -= pz
        b.outX += px
        b.outZ += pz
      }
    }
    if (!moved) break
  }
  for (const b of bodies) {
    const m = Math.hypot(b.outX, b.outZ)
    if (m > maxOffset) {
      b.outX *= maxOffset / m
      b.outZ *= maxOffset / m
    }
  }
}
