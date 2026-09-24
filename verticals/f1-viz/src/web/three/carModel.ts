import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Cache the asset across cars and view remounts. Geometry/textures stay shared;
// only materials are cloned so pit opacity can differ per driver.
const models = new Map<string, Promise<THREE.Group>>()

function loadCarModel(url: string): Promise<THREE.Group> {
  const cached = models.get(url)
  if (cached) return cached
  const pending = new GLTFLoader().loadAsync(url).then(({ scene }) => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const normalized = new THREE.Group()
    // Ground the wheels, centre horizontally, and normalize length to one.
    scene.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
    normalized.add(scene)
    normalized.scale.setScalar(1 / Math.max(size.z, 0.001))
    return normalized
  }).catch((error) => {
    models.delete(url)
    throw error
  })
  models.set(url, pending)
  return pending
}

export function useCarModel(url?: string): THREE.Group | null {
  const [loaded, setLoaded] = useState<{ url: string; scene: THREE.Group } | null>(null)
  useEffect(() => {
    if (!url) return
    let active = true
    loadCarModel(url).then((scene) => {
      if (active) setLoaded({ url, scene })
    }).catch((error) => console.warn('Unable to load the telemetry car model', error))
    return () => { active = false }
  }, [url])
  return loaded && loaded.url === url ? loaded.scene : null
}

export function cloneCarModel(source: THREE.Group) {
  const scene = source.clone(true)
  const materials = new Map<THREE.Material, THREE.Material>()
  const cloneMaterial = (original: THREE.Material) => {
    let material = materials.get(original)
    if (!material) {
      material = original.clone()
      material.transparent = true
      materials.set(original, material)
    }
    return material
  }
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material)
  })
  return { scene, materials: [...materials.values()] }
}
