import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Cars render at true scale: the model is normalised to this length (metres),
 * which is what the world (1 unit = 1 m) and the cameras assume.
 */
export const CAR_LENGTH_M = 5.6
export const CAR_WIDTH_M = 2.0

/** Names of the articulated parts `rigCarModel` adds (found again after clone). */
const WHEEL_FL = 'vz-wheel-fl'
const WHEEL_FR = 'vz-wheel-fr'
const STEERING = 'vz-steering-wheel'

/** Driver eye point when the model has no detectable steering wheel (metres, car frame). */
const DEFAULT_EYE: [number, number, number] = [0, 1.05, -0.12]

export interface CarModelTemplate {
  scene: THREE.Group
  /** Driver eye position in the car frame (metres; +Z forward, +Y up, origin centre/ground). */
  eye: [number, number, number]
}

// Cache the asset across cars and view remounts. Geometry/textures stay shared;
// only materials are cloned so pit opacity can differ per driver.
const models = new Map<string, Promise<CarModelTemplate>>()

export function loadCarModel(url: string): Promise<CarModelTemplate> {
  const cached = models.get(url)
  if (cached) return cached
  const pending = new GLTFLoader().loadAsync(url).then(({ scene }) => {
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const steeringAt = rigCarModel(scene, box)
    const normalized = new THREE.Group()
    // Ground the wheels, centre horizontally, and scale to true length.
    scene.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
    normalized.add(scene)
    const k = CAR_LENGTH_M / Math.max(size.z, 0.001)
    normalized.scale.setScalar(k)
    // Helmet-cam eye: ~0.7 m behind and ~0.4 m above the steering wheel hub.
    const eye: [number, number, number] = steeringAt
      ? [0, (steeringAt.y - box.min.y) * k + 0.38, (steeringAt.z - center.z) * k - 0.7]
      : DEFAULT_EYE
    return { scene: normalized, eye }
  }).catch((error) => {
    models.delete(url)
    throw error
  })
  models.set(url, pending)
  return pending
}

export function useCarModel(url?: string): CarModelTemplate | null {
  const [loaded, setLoaded] = useState<{ url: string; model: CarModelTemplate } | null>(null)
  useEffect(() => {
    if (!url) return
    let active = true
    loadCarModel(url).then((model) => {
      if (active) setLoaded({ url, model })
    }).catch((error) => console.warn('Unable to load the telemetry car model', error))
    return () => { active = false }
  }, [url])
  return loaded && loaded.url === url ? loaded.model : null
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

export interface CarInstance {
  scene: THREE.Group
  materials: THREE.Material[]
  /** Steerable front-wheel pivots (yaw about +Y); null when the model has none. */
  wheelFL: THREE.Object3D | null
  wheelFR: THREE.Object3D | null
  /** Steering-wheel pivot (rolls about +Z); null when none was found. */
  steering: THREE.Object3D | null
}

/**
 * Per-car instance: shared geometry, fresh materials — the body painted in the
 * constructor colour, tyres and steering wheel black. Any source material
 * whose name mentions "tire" is a tyre; everything else is bodywork, so a
 * textured source model renders livery-free too.
 */
export function cloneCarModel(source: CarModelTemplate, color: string): CarInstance {
  const scene = source.scene.clone(true)
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.45, transparent: true })
  const tire = new THREE.MeshStandardMaterial({ color: TIRE_COLOR, metalness: 0, roughness: 0.9, transparent: true })
  const pick = (original: THREE.Material) => (/tire|steering/i.test(original.name) ? tire : body)
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.material = Array.isArray(object.material) ? object.material.map(pick) : pick(object.material)
  })
  return {
    scene,
    materials: [body, tire],
    wheelFL: scene.getObjectByName(WHEEL_FL) ?? null,
    wheelFR: scene.getObjectByName(WHEEL_FR) ?? null,
    steering: scene.getObjectByName(STEERING) ?? null,
  }
}

// ── Rigging ─────────────────────────────────────────────────────────────────

interface Part {
  mesh: THREE.Mesh
  /** Mesh → scene-root matrix. */
  toRoot: THREE.Matrix4
  /** Triangle ids moved to each pivot. */
  moved: Map<string, number[]>
}

/**
 * The supplied models are merged into a body mesh and a tyre mesh, so nothing
 * can turn on its own. Split, in place, the pieces that should:
 *
 *   - each front tyre (the tyre-material triangles ahead of the car's centre,
 *     one per side) plus every body piece that sits entirely inside it — rim,
 *     hub, brake duct — onto a pivot at the wheel centre, steered about +Y;
 *   - the steering wheel (body pieces inside the cockpit box just ahead of
 *     the driver) onto a pivot at its hub, rolled about +Z.
 *
 * Works in the glTF scene's own frame (+Z forward, +X to the car's left).
 * Models without tyre materials / a steering wheel simply skip that part.
 * Returns the steering-wheel hub position (scene frame) when one was found.
 */
function rigCarModel(root: THREE.Object3D, box: THREE.Box3): THREE.Vector3 | null {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const L = Math.max(size.z, 1e-6)
  const rootInv = root.matrixWorld.clone().invert()

  const tires: Part[] = []
  const bodies: Part[] = []
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return
    const geo = o.geometry as THREE.BufferGeometry
    if (!geo.getAttribute('position')) return
    const part: Part = { mesh: o, toRoot: rootInv.clone().multiply(o.matrixWorld), moved: new Map() }
    ;(/tire/i.test((o.material as THREE.Material).name) ? tires : bodies).push(part)
  })

  const v = new THREE.Vector3()
  const vertexAt = (part: Part, vi: number, out: THREE.Vector3) => {
    const pos = part.mesh.geometry.getAttribute('position')
    return out.fromBufferAttribute(pos, vi).applyMatrix4(part.toRoot)
  }
  const triVertex = (part: Part, tri: number, c: number) => {
    const index = part.mesh.geometry.index
    return index ? index.getX(tri * 3 + c) : tri * 3 + c
  }
  const triCount = (part: Part) => {
    const g = part.mesh.geometry
    return (g.index ? g.index.count : g.getAttribute('position').count) / 3
  }

  // Front tyres: tyre triangles whose centroid is ahead of the car's centre.
  const wheelBoxes = new Map<string, THREE.Box3>([[WHEEL_FL, new THREE.Box3()], [WHEEL_FR, new THREE.Box3()]])
  const c = new THREE.Vector3()
  for (const part of tires) {
    const n = triCount(part)
    for (let t = 0; t < n; t++) {
      c.set(0, 0, 0)
      for (let k = 0; k < 3; k++) c.add(vertexAt(part, triVertex(part, t, k), v))
      c.multiplyScalar(1 / 3)
      if (c.z <= center.z) continue
      const name = c.x > center.x ? WHEEL_FL : WHEEL_FR
      push(part.moved, name, t)
      for (let k = 0; k < 3; k++) wheelBoxes.get(name)!.expandByPoint(vertexAt(part, triVertex(part, t, k), v))
    }
  }

  // Containment boxes for body pieces: wheels grow inboard (brake duct /
  // upright), the steering wheel is a fixed cockpit window ahead of the seat.
  const targets = new Map<string, THREE.Box3>()
  for (const [name, wb] of wheelBoxes) {
    if (wb.isEmpty()) continue
    const pad = 0.006 * L
    const inboard = 0.02 * L
    const grown = wb.clone().expandByScalar(pad)
    if (name === WHEEL_FL) grown.min.x -= inboard
    else grown.max.x += inboard
    targets.set(name, grown)
  }
  const zRear = box.min.z
  targets.set(
    STEERING,
    new THREE.Box3(
      new THREE.Vector3(center.x - 0.03 * L, box.min.y + 0.1 * L, zRear + 0.575 * L),
      new THREE.Vector3(center.x + 0.03 * L, box.min.y + 0.145 * L, zRear + 0.61 * L),
    ),
  )

  // Body pieces = connected components (shared vertices, welded by position).
  for (const part of bodies) {
    const comps = components(part, vertexAt)
    for (const comp of comps) {
      for (const [name, target] of targets) {
        if (target.containsBox(comp.box)) {
          for (const t of comp.tris) push(part.moved, name, t)
          break
        }
      }
    }
  }

  const steeringParts = bodies.reduce((acc, p) => acc + (p.moved.get(STEERING)?.length ?? 0), 0)
  // Pivots at each moved group's centre (steering: its largest piece's hub).
  const pivots = new Map<string, THREE.Vector3>()
  for (const name of [WHEEL_FL, WHEEL_FR, STEERING]) {
    const gb = new THREE.Box3()
    for (const part of [...tires, ...bodies]) {
      for (const t of part.moved.get(name) ?? []) {
        for (let k = 0; k < 3; k++) gb.expandByPoint(vertexAt(part, triVertex(part, t, k), v))
      }
    }
    if (gb.isEmpty()) continue
    if (name === STEERING && steeringParts < 50) continue
    pivots.set(name, gb.getCenter(new THREE.Vector3()))
  }

  for (const [name, pivotAt] of pivots) {
    const pivot = new THREE.Group()
    pivot.name = name
    pivot.position.copy(pivotAt)
    root.add(pivot)
    for (const part of [...tires, ...bodies]) {
      const tris = part.moved.get(name)
      if (!tris?.length) continue
      let material = part.mesh.material as THREE.Material
      if (name === STEERING) material = new THREE.MeshStandardMaterial({ name: 'steering-wheel' })
      const piece = new THREE.Mesh(subsetGeometry(part, tris, triVertex), material)
      piece.name = `${name}-part`
      const local = new THREE.Matrix4().makeTranslation(-pivotAt.x, -pivotAt.y, -pivotAt.z).multiply(part.toRoot)
      local.decompose(piece.position, piece.quaternion, piece.scale)
      pivot.add(piece)
    }
  }

  // Remove the moved triangles from their source meshes.
  for (const part of [...tires, ...bodies]) {
    const gone = new Set<number>()
    for (const [name, tris] of part.moved) if (pivots.has(name)) tris.forEach((t) => gone.add(t))
    if (!gone.size) continue
    const n = triCount(part)
    const rest: number[] = []
    for (let t = 0; t < n; t++) if (!gone.has(t)) rest.push(t)
    part.mesh.geometry = subsetGeometry(part, rest, triVertex)
  }

  return pivots.get(STEERING) ?? null
}

function push(map: Map<string, number[]>, key: string, value: number) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** New geometry sharing `part`'s vertex attributes, drawing only `tris`. */
function subsetGeometry(
  part: Part,
  tris: number[],
  triVertex: (part: Part, tri: number, c: number) => number,
): THREE.BufferGeometry {
  const src = part.mesh.geometry
  const geo = new THREE.BufferGeometry()
  for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr)
  const index = new Uint32Array(tris.length * 3)
  for (let i = 0; i < tris.length; i++) {
    for (let k = 0; k < 3; k++) index[i * 3 + k] = triVertex(part, tris[i], k)
  }
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  return geo
}

/** Connected components of a mesh (by shared index or identical position). */
function components(
  part: Part,
  vertexAt: (part: Part, vi: number, out: THREE.Vector3) => THREE.Vector3,
): Array<{ tris: number[]; box: THREE.Box3 }> {
  const geo = part.mesh.geometry
  const pos = geo.getAttribute('position')
  const nV = pos.count
  const parent = new Int32Array(nV)
  for (let i = 0; i < nV; i++) parent[i] = i
  const find = (x: number) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  // Weld split vertices (hard-edge seams) by position.
  const seen = new Map<string, number>()
  for (let i = 0; i < nV; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`
    const prev = seen.get(key)
    if (prev == null) seen.set(key, i)
    else union(prev, i)
  }
  const index = geo.index
  const nT = (index ? index.count : nV) / 3
  const vi = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k)
  for (let t = 0; t < nT; t++) {
    union(vi(t, 0), vi(t, 1))
    union(vi(t, 0), vi(t, 2))
  }
  const byRoot = new Map<number, { tris: number[]; box: THREE.Box3 }>()
  const v = new THREE.Vector3()
  for (let t = 0; t < nT; t++) {
    const r = find(vi(t, 0))
    let comp = byRoot.get(r)
    if (!comp) {
      comp = { tris: [], box: new THREE.Box3() }
      byRoot.set(r, comp)
    }
    comp.tris.push(t)
    for (let k = 0; k < 3; k++) comp.box.expandByPoint(vertexAt(part, vi(t, k), v))
  }
  return [...byRoot.values()]
}
