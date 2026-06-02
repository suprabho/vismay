import * as THREE from 'three'

/**
 * Inspect mode doesn't run a per-frame transform on the ship itself — the
 * camera is driven by `<OrbitControls />` and labels are rendered by drei
 * `<Html>` in `StarshipScene`. This file exists to keep the four-mode
 * symmetry and to host helpers if/when hover-tint logic lands here.
 */

export function applyInspect(_root: THREE.Group, _delta: number): void {
  // intentional no-op
}

/** Centroid of a named part, in the ship's local space. Used for label anchoring. */
export function partCentroid(child: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3())
}
