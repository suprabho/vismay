import type * as THREE from 'three'

/**
 * Each named part has a target offset along ship-local Y, measured in
 * scene-graph units. The merged glb is normalized so the ship stands on the
 * XZ plane with the Raptor cluster at the bottom and the cone at the top;
 * offsets push parts further along their stacking direction.
 *
 * Pivot offsets are deliberately gentle — the goal is "exploded view"
 * legibility, not a comic-book launch sequence.
 */
const PART_OFFSETS_Y: Record<string, number> = {
  cone: 1.6,
  tank: 0.7,
  raptor: -0.9,
}

/**
 * Lerp each named part between its assembled origin (stored on its
 * `userData.assembledY`) and `assembledY + PART_OFFSETS_Y[name]`.
 *
 * Uses `traverse` so we don't depend on the named meshes being direct
 * children — the GLB nests them under its own scene root and we wrap
 * everything in a rotation group, so the named parts sit at depth 2+.
 *
 * The first call records `assembledY` so subsequent calls have a stable
 * reference even if `progress` swings backward.
 */
export function applyExplode(root: THREE.Object3D, progress: number): void {
  const t = Math.max(0, Math.min(1, progress))
  root.traverse((child) => {
    const offset = PART_OFFSETS_Y[child.name]
    if (offset == null) return
    const ud = child.userData as { assembledY?: number }
    if (ud.assembledY == null) ud.assembledY = child.position.y
    child.position.y = ud.assembledY + offset * t
  })
}

export { PART_OFFSETS_Y }
