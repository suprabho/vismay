'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Html, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type {
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
  /** Optional fixed height; defaults to filling the parent. */
  height?: string | number
  /** Tells the parent (e.g. VizRenderProps.noteReady) that first paint occurred. */
  onReady?: () => void
  /** When true, attaches a soft-shadow ground plane under the ship. */
  showGround?: boolean
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
  height = '100%',
  onReady,
  showGround = true,
}: StarshipSceneProps) {
  return (
    // The conversion script normalizes the ship to ~3 units tall and
    // centered on origin, so we can pin the camera once instead of relying
    // on drei `<Bounds>` (which doesn't always refit after a Suspense load).
    // `onCreated` calls `lookAt` because Canvas's `camera` prop only sets
    // position — without an explicit lookAt the camera points down its own
    // -Z axis and the origin falls outside the frustum.
    <Canvas
      camera={{ position: [3.5, 1.4, 5], fov: 40 }}
      dpr={[1, 2]}
      style={{ width: '100%', height }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 4]} intensity={1.3} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />
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
            color={0x0a0d12}
            roughness={1}
            metalness={0}
            transparent
            opacity={0.55}
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
