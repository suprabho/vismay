import * as THREE from 'three'

/**
 * Explode mode — pulls named top-level groups apart along world Y. The
 * direction (up or down) is auto-derived from each part's centroid relative
 * to the model's overall centroid, so a rocket with a stage at the top
 * separates upward and a stage at the bottom separates downward without any
 * per-model offset table.
 *
 * `partNames` is supplied by the caller (the active `RocketSpec`'s
 * `partNames`). Anything in that list is looked up via `getObjectByName` on
 * the root scene — works regardless of nesting depth because GLBs from
 * different sources put their named groups at different levels.
 *
 * Baselines are stored on `root.userData.__explodeBaseline` on first call
 * so the assembled positions stay stable across scrub direction changes.
 */

const SPREAD = 1.1 // multiplier on the part's distance from center
const MIN_OFFSET = 0.4 // floor for very-close-to-center parts

interface PartBaseline {
  name: string
  baselineY: number
  offset: number
}

export function applyExplode(
  root: THREE.Object3D,
  progress: number,
  partNames: readonly string[],
): void {
  const t = Math.max(0, Math.min(1, progress))
  const ud = root.userData as { __explodeBaseline?: PartBaseline[] }

  if (!ud.__explodeBaseline) {
    const baselines: PartBaseline[] = []
    const fullBox = new THREE.Box3().setFromObject(root)
    const fullSize = fullBox.getSize(new THREE.Vector3())
    const fullCenter = fullBox.getCenter(new THREE.Vector3())
    const fullHeight = Math.max(fullSize.y, 0.001)
    for (const name of partNames) {
      const obj = root.getObjectByName(name)
      if (!obj) continue
      // World-space centroid of this part; subtract the model's centroid to
      // get its signed offset along Y, then normalize by the model's height.
      const partBox = new THREE.Box3().setFromObject(obj)
      const partCenterY = (partBox.min.y + partBox.max.y) / 2
      const relative = (partCenterY - fullCenter.y) / fullHeight
      const sign = relative >= 0 ? 1 : -1
      const magnitude = Math.max(Math.abs(relative) * SPREAD, MIN_OFFSET)
      baselines.push({
        name,
        baselineY: obj.position.y,
        offset: sign * magnitude,
      })
    }
    ud.__explodeBaseline = baselines
  }

  for (const { name, baselineY, offset } of ud.__explodeBaseline) {
    const obj = root.getObjectByName(name)
    if (!obj) continue
    obj.position.y = baselineY + offset * t
  }
}
