import type * as THREE from 'three'

const BELLYFLOP_DEG = 70
const DEG_TO_RAD = Math.PI / 180

/**
 * Back-ease curve — slight overshoot near the end so the ship "settles" into
 * the horizontal belly-flop attitude instead of clamping. Standard easing
 * from easings.net (`easeOutBack` with a soft `c1 = 1.40`).
 */
function easeOutBack(t: number): number {
  const c1 = 1.4
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * Pitches the root group from 0° to ~70° on the X axis as `progress` goes
 * 0 → 1. Scrubs both directions cleanly when the user scrolls back up.
 */
export function applyBellyflop(root: THREE.Group, progress: number): void {
  const t = Math.max(0, Math.min(1, progress))
  const eased = easeOutBack(t)
  root.rotation.x = eased * BELLYFLOP_DEG * DEG_TO_RAD
}

export { BELLYFLOP_DEG }
