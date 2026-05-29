'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type {
  CameraAnimation,
  CameraEasing,
  RocketModel,
  StarshipMaterial,
  StarshipMode,
} from '../types'
import { ROCKET_MODELS } from '../types'
import { applyMaterial } from './materials'
import { applyRotate } from './modes/rotate'
import { applyExplode } from './modes/explode'
import { applyBellyflop } from './modes/bellyflop'
import { partCentroid } from './modes/inspect'

interface StarshipSceneProps {
  /** Which rocket to render. Defaults to `'starship'`. */
  model?: RocketModel
  /** Active animation behavior. Switching modes does not re-mount the scene. */
  mode: StarshipMode
  /** 0..1 scrub value driving explode/bellyflop targets. Ignored for rotate/inspect. */
  progress: number
  /** Material preset applied to every mesh under the loaded glb. */
  material: StarshipMaterial
  /**
   * Optional scroll-scrubbed camera move. When set (and `mode !== 'inspect'`),
   * a `<CameraRig>` drives the camera from `camera.from` → `camera.to` by
   * `progress`. Omit to use the static default framing.
   */
  camera?: CameraAnimation
  /** Optional fixed height; defaults to filling the parent. */
  height?: string | number
  /** Tells the parent (e.g. VizRenderProps.noteReady) that first paint occurred. */
  onReady?: () => void
  /** When true, attaches a soft-shadow ground plane under the ship. */
  showGround?: boolean
  /** Color of the ground disc under the ship. Hex string (e.g. `#0a0d12`) or numeric hex. */
  groundColor?: string | number
  /** Opacity of the ground disc, 0..1. */
  groundOpacity?: number
}

/**
 * Inner scene — runs inside `<Canvas>`. Loads the merged glb, names each
 * top-level child by the convention emitted by `scripts/convert-starship-assets.ts`
 * (`cone`, `tank`, `raptor`), and routes per-frame updates to the active
 * mode handler.
 */
function StarshipShip({
  model,
  mode,
  progress,
  material,
  onReady,
}: {
  model: RocketModel
  mode: StarshipMode
  progress: number
  material: StarshipMaterial
  onReady?: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const spec = ROCKET_MODELS[model]
  const { scene } = useGLTF(spec.glbUrl)
  // `useGLTF` caches by URL — clone before mutating so multiple scenes (e.g.
  // a demo grid showing all four modes) don't fight over a shared graph.
  const ship = useMemo(() => scene.clone(true), [scene])

  // Apply the material preset whenever it changes — but only for rockets
  // that opt in (the STL-sourced Starship has no authored materials, while
  // the Sketchfab Falcon 9 has F9-branded textures we'd lose if we overrode).
  useEffect(() => {
    if (spec.materialOverrides === 'apply') {
      applyMaterial(ship, material)
    }
  }, [ship, material, spec.materialOverrides])

  // Signal first paint after one frame so parent capture/readiness systems
  // know the model is on-screen, not just queued for upload.
  useEffect(() => {
    if (!onReady) return
    const handle = requestAnimationFrame(() => onReady())
    return () => cancelAnimationFrame(handle)
  }, [onReady])

  useFrame((_state, delta) => {
    const group = groupRef.current
    if (!group) return
    if (mode === 'rotate') applyRotate(group, delta)
    else if (mode === 'explode') applyExplode(group, progress, spec.partNames)
    else if (mode === 'bellyflop') applyBellyflop(group, progress)
    // inspect: no per-frame transform; OrbitControls drives the camera.
  })

  // Inspector labels — find the named parts anywhere in the loaded tree (not
  // just direct children), since GLBs from different exporters nest at
  // different depths.
  const partLabels = useMemo<{ name: string; pos: THREE.Vector3 }[]>(() => {
    if (mode !== 'inspect') return []
    const labels: { name: string; pos: THREE.Vector3 }[] = []
    for (const name of spec.partNames) {
      const obj = ship.getObjectByName(name)
      if (obj) labels.push({ name, pos: partCentroid(obj) })
    }
    return labels
  }, [ship, mode, spec.partNames])

  // The GLB is baked Y-up by the conversion script's `rotateX(-Math.PI / 2)`,
  // so we can mount the primitive directly under `groupRef` and let
  // applyBellyflop set rotation.x on the same group without conflict.
  return (
    <group ref={groupRef}>
      <primitive object={ship} />
      {partLabels.map((label) => (
        <Html
          key={label.name}
          position={label.pos}
          center
          style={{
            background: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            pointerEvents: 'none',
            textTransform: 'capitalize',
            letterSpacing: 0.5,
          }}
        >
          {label.name}
        </Html>
      ))}
    </group>
  )
}

const EASING_FNS: Record<CameraEasing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
}

/** Frame-rate-independent exponential approach toward `target` (cf. THREE.MathUtils.damp). */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

/** Same, but along the shortest angular path so orbits never wind the long way round. */
function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  // Wrap the delta into (-π, π] before approaching, so e.g. 170° → -170°
  // takes the 20° short hop rather than a 340° spin.
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * (1 - Math.exp(-lambda * dt))
}

const PHI_EPSILON = 1e-3

/**
 * Scroll-scrubbed camera move. Computes a *target* pose by interpolating the
 * two authored keyframes by eased `progress`, then damps the live camera
 * toward it every frame.
 *
 * Interpolating the position as a spherical offset around the look-at target
 * means an angle delta reads as an orbit and a radius delta reads as a dolly;
 * `fov` lerps for a lens zoom and the target itself lerps for a look-at pan.
 * Because the *damp* also runs in spherical space, a discrete `progress` jump
 * (snap-scroll decks step `activeStep` in integers) still glides as an arc
 * instead of cutting straight through the model.
 */
function CameraRig({ camera, progress }: { camera: CameraAnimation; progress: number }) {
  // Precompute each keyframe's spherical offset + target once.
  const keys = useMemo(() => {
    const make = (kf: CameraAnimation['from']) => {
      const target = new THREE.Vector3().fromArray(kf.target)
      const offset = new THREE.Vector3().fromArray(kf.position).sub(target)
      const sph = new THREE.Spherical().setFromVector3(offset)
      return { target, sph, fov: kf.fov }
    }
    return { from: make(camera.from), to: make(camera.to) }
  }, [camera.from, camera.to])

  // Live, damped pose. `ready: false` makes the first frame snap to the
  // target so there's no fly-in from a stale default position.
  const live = useRef({
    radius: keys.from.sph.radius,
    phi: keys.from.sph.phi,
    theta: keys.from.sph.theta,
    fov: keys.from.fov,
    target: new THREE.Vector3().copy(keys.from.target),
    ready: false,
  })

  // Scratch objects reused every frame to avoid per-frame allocation.
  const scratch = useMemo(
    () => ({ sph: new THREE.Spherical(), target: new THREE.Vector3(), pos: new THREE.Vector3() }),
    [],
  )

  useFrame(({ camera: cam }, delta) => {
    const t = EASING_FNS[camera.easing](THREE.MathUtils.clamp(progress, 0, 1))
    const { from, to } = keys

    // Progress-derived target pose.
    const tRadius = THREE.MathUtils.lerp(from.sph.radius, to.sph.radius, t)
    const tPhi = THREE.MathUtils.lerp(from.sph.phi, to.sph.phi, t)
    const tTheta = THREE.MathUtils.lerp(from.sph.theta, to.sph.theta, t)
    const tFov = THREE.MathUtils.lerp(from.fov, to.fov, t)
    scratch.target.copy(from.target).lerp(to.target, t)

    const s = live.current
    // Clamp dt so a long tab-away pause doesn't fling the camera in one frame.
    const dt = Math.min(delta, 0.1)
    const k = camera.damping
    if (!s.ready) {
      s.radius = tRadius
      s.phi = tPhi
      s.theta = tTheta
      s.fov = tFov
      s.target.copy(scratch.target)
      s.ready = true
    } else {
      s.radius = damp(s.radius, tRadius, k, dt)
      s.phi = dampAngle(s.phi, tPhi, k, dt)
      s.theta = dampAngle(s.theta, tTheta, k, dt)
      s.fov = damp(s.fov, tFov, k, dt)
      s.target.x = damp(s.target.x, scratch.target.x, k, dt)
      s.target.y = damp(s.target.y, scratch.target.y, k, dt)
      s.target.z = damp(s.target.z, scratch.target.z, k, dt)
    }

    // Keep phi off the poles so the camera can't gimbal-flip when looking
    // straight down/up the Y axis.
    scratch.sph.set(
      s.radius,
      THREE.MathUtils.clamp(s.phi, PHI_EPSILON, Math.PI - PHI_EPSILON),
      s.theta,
    )
    scratch.pos.setFromSpherical(scratch.sph).add(s.target)
    cam.position.copy(scratch.pos)
    cam.lookAt(s.target)

    const persp = cam as THREE.PerspectiveCamera
    if (persp.isPerspectiveCamera && Math.abs(persp.fov - s.fov) > 1e-3) {
      persp.fov = s.fov
      persp.updateProjectionMatrix()
    }
  })

  return null
}

/**
 * Canvas wrapper. Held in its own component so the inner R3F tree
 * (`StarshipShip`) can use `Suspense`-aware hooks (`useGLTF`) without the
 * caller worrying about boundaries.
 */
export function StarshipScene({
  model = 'starship',
  mode,
  progress,
  material,
  camera,
  height = '100%',
  onReady,
  showGround = true,
  groundColor = 0x0a0d12,
  groundOpacity = 0.55,
}: StarshipSceneProps) {
  // When a camera move is authored, start the camera at its `from` keyframe so
  // there's no first-frame jump before <CameraRig> takes over. Otherwise use
  // the static default framing.
  const initialPosition: [number, number, number] = camera ? camera.from.position : [3.5, 1.4, 5]
  const initialFov = camera ? camera.from.fov : 40
  const initialTarget: [number, number, number] = camera ? camera.from.target : [0, 0, 0]

  return (
    // The conversion script normalizes the ship to ~3 units tall and
    // centered on origin, so we can pin the camera once instead of relying
    // on drei `<Bounds>` (which doesn't always refit after a Suspense load).
    // `onCreated` calls `lookAt` because Canvas's `camera` prop only sets
    // position — without an explicit lookAt the camera points down its own
    // -Z axis and the origin falls outside the frustum. When `camera` is set,
    // <CameraRig> re-aims every frame; this is just the first-paint pose.
    <Canvas
      camera={{ position: initialPosition, fov: initialFov }}
      dpr={[1, 2]}
      style={{ width: '100%', height }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ camera: cam }) => cam.lookAt(initialTarget[0], initialTarget[1], initialTarget[2])}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 4]} intensity={1.3} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />
      {/* inspect mode hands the camera to OrbitControls, so the rig stays out. */}
      {camera && mode !== 'inspect' && <CameraRig camera={camera} progress={progress} />}
      <Suspense fallback={null}>
        <Environment preset="studio" />
        <StarshipShip
          model={model}
          mode={mode}
          progress={progress}
          material={material}
          onReady={onReady}
        />
      </Suspense>
      {showGround && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.55, 0]} receiveShadow>
          <circleGeometry args={[5, 64]} />
          <meshStandardMaterial
            color={groundColor}
            roughness={1}
            metalness={0}
            transparent
            opacity={groundOpacity}
          />
        </mesh>
      )}
      {mode === 'inspect' && (
        <OrbitControls enablePan={false} enableDamping target={[0, 0, 0]} />
      )}
    </Canvas>
  )
}

// Preload every registered model's GLB so subsequent `<StarshipScene>`
// mounts skip the network round-trip. Safe to call at module scope —
// drei's `preload` is a no-op outside the browser.
for (const spec of Object.values(ROCKET_MODELS)) {
  useGLTF.preload(spec.glbUrl)
}
