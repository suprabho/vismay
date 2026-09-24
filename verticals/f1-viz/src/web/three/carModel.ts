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

/**
 * Default replay car: an RB22 with the livery stripped (textures dropped, all
 * parts merged into `body` + `tire` materials, decimated to ~73k tris, 2 MB).
 * Public, CORS-open Supabase Storage object, so every surface (vizf1, catalog,
 * render service, admin) loads the same file.
 */
export const DEFAULT_CAR_MODEL_URL =
  'https://grbrfpaznehikakupavx.supabase.co/storage/v1/object/public/story-assets/vizf1/models/rb22-solid.glb'

const TIRE_COLOR = '#111111'

/**
 * Per-car instance: shared geometry, fresh materials — the body painted in the
 * constructor colour, tyres black. Any source material whose name mentions
 * "tire" is a tyre; everything else is bodywork, so a textured source model
 * renders livery-free too.
 */
export function cloneCarModel(source: THREE.Group, color: string) {
  const scene = source.clone(true)
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.45, transparent: true })
  const tire = new THREE.MeshStandardMaterial({ color: TIRE_COLOR, metalness: 0, roughness: 0.9, transparent: true })
  const pick = (original: THREE.Material) => (/tire/i.test(original.name) ? tire : body)
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.material = Array.isArray(object.material) ? object.material.map(pick) : pick(object.material)
  })
  return { scene, materials: [body, tire] }
}
