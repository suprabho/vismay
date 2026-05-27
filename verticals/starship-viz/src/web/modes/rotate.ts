import type * as THREE from 'three'

/**
 * Gentle Y-axis spin. The frame loop receives `delta` (seconds since last
 * frame) so the spin speed stays constant across refresh rates. `progress`
 * is ignored — rotate is a continuous showcase, not a scrubbable timeline.
 */
export const ROTATE_RAD_PER_SEC = 0.25

export function applyRotate(root: THREE.Group, delta: number): void {
  root.rotation.y += ROTATE_RAD_PER_SEC * delta
}
