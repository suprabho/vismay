/**
 * Material presets for the Starship parts.
 *
 * `metal`  — brushed-stainless look (the public-facing finish of SN-series
 *            and later flight hardware). Bright base, high metalness, low
 *            roughness, picks up the studio HDRI strongly.
 * `black`  — matte black engineering reference look (matches the source
 *            STLs named `*_black_x1.stl`). Neutral base, no metalness,
 *            higher roughness so it doesn't catch reflections.
 *
 * Both share the same env-map exposure so swapping materials at runtime
 * doesn't reset the lighting feel.
 */

import * as THREE from 'three'

export const metalMaterial = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0xcfd4d8,
    metalness: 0.9,
    roughness: 0.28,
    envMapIntensity: 1.0,
  })

export const blackMaterial = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0x1a1d22,
    metalness: 0.05,
    roughness: 0.62,
    envMapIntensity: 0.4,
  })

/**
 * Walk a scene graph and replace every mesh's material with the supplied
 * preset. Called once per mode/material change — cheap relative to the GLB
 * load, and avoids holding stale materials across scene re-mounts.
 */
export function applyMaterial(
  root: THREE.Object3D,
  variant: 'metal' | 'black',
): void {
  const factory = variant === 'metal' ? metalMaterial : blackMaterial
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      // Dispose the existing material to release its GPU resources before
      // swapping. Without this, repeated variant toggles leak materials
      // until the canvas unmounts.
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose())
      } else {
        mesh.material.dispose()
      }
      mesh.material = factory()
    }
  })
}
