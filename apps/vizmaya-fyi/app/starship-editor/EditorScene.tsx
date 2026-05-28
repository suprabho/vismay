'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ROCKET_MODELS } from '@vismay/starship-viz/types'
import type { RocketModel } from '@vismay/starship-viz/types'
import type { EditorState, MaterialVariant } from './types'

/**
 * Build a fresh material instance for the given variant. Called whenever a
 * part's effective material changes. The editor's "normal" + "wireframe"
 * variants only make sense in this debug view — they're not exposed by the
 * production module.
 */
function buildMaterial(variant: MaterialVariant): THREE.Material {
  switch (variant) {
    case 'metal':
      return new THREE.MeshStandardMaterial({
        color: 0xcfd4d8,
        metalness: 0.9,
        roughness: 0.28,
        envMapIntensity: 1,
      })
    case 'black':
      return new THREE.MeshStandardMaterial({
        color: 0x1a1d22,
        metalness: 0.05,
        roughness: 0.62,
        envMapIntensity: 0.4,
      })
    case 'normal':
      return new THREE.MeshNormalMaterial({ flatShading: false })
    case 'wireframe':
      return new THREE.MeshBasicMaterial({
        color: 0x6cd1ff,
        wireframe: true,
      })
  }
}

interface ShipProps {
  state: EditorState
  partNames: readonly string[]
}

/**
 * Inner scene. Loads the active model's GLB and applies the editor's
 * per-part overrides every frame. Direct three.js mutation rather than
 * declarative `<primitive position={…}>` because the GLB owns the meshes —
 * we don't want to clone-then-discard each frame, and Three's transform
 * math is cheap to repeat.
 */
function Ship({ state, partNames }: ShipProps) {
  const spec = ROCKET_MODELS[state.model]
  const { scene } = useGLTF(spec.glbUrl)
  // Clone so the editor doesn't poison the cached scene if the user
  // navigates between routes or swaps models.
  const ship = useMemo(() => scene.clone(true), [scene])

  // Find each named part once. We cache its *original* position and scale
  // on userData so the editor's `positionOffset` and `scaleMultiplier`
  // stay relative to the GLB's truth even after material swaps.
  const parts = useMemo(() => {
    const found: Record<string, THREE.Object3D> = {}
    for (const name of partNames) {
      const obj = ship.getObjectByName(name)
      if (!obj) continue
      const ud = obj.userData as {
        baseline?: { pos: THREE.Vector3; scale: THREE.Vector3 }
      }
      if (!ud.baseline) {
        ud.baseline = { pos: obj.position.clone(), scale: obj.scale.clone() }
      }
      found[name] = obj
    }
    return found
  }, [ship, partNames])

  // Track the last-applied material variant per part so we don't recreate
  // materials every frame (constructor + dispose pair is cheap but not free).
  const appliedMaterialRef = useRef<Record<string, MaterialVariant | null>>({})

  useFrame(() => {
    for (const name of partNames) {
      const obj = parts[name]
      if (!obj) continue
      const ov = state.overrides[name]
      if (!ov) continue
      const baseline = (obj.userData as { baseline: { pos: THREE.Vector3; scale: THREE.Vector3 } }).baseline

      // Visibility — solo wins over the per-part flag.
      obj.visible = state.solo ? state.solo === name : ov.visible

      obj.position.set(
        baseline.pos.x + ov.positionOffset.x,
        baseline.pos.y + ov.positionOffset.y,
        baseline.pos.z + ov.positionOffset.z,
      )
      obj.rotation.set(ov.rotation.x, ov.rotation.y, ov.rotation.z)
      obj.scale.set(
        baseline.scale.x * ov.scaleMultiplier,
        baseline.scale.y * ov.scaleMultiplier,
        baseline.scale.z * ov.scaleMultiplier,
      )

      // Material — only swap when the effective variant changes. Skip
      // entirely for `preserve-authored` models so we don't trample the
      // Sketchfab textures.
      if (spec.materialOverrides === 'apply') {
        const effective = ov.materialOverride ?? state.globalMaterial
        if (appliedMaterialRef.current[name] !== effective) {
          obj.traverse((c) => {
            if (!(c as THREE.Mesh).isMesh) return
            const m = c as THREE.Mesh
            const old = m.material
            if (Array.isArray(old)) old.forEach((mat) => mat.dispose())
            else old.dispose()
            m.material = buildMaterial(effective)
          })
          appliedMaterialRef.current[name] = effective
        }
      }
    }
  })

  return <primitive object={ship} />
}

/**
 * Per-part Box3Helper rendered as a sibling of the ship. Recomputes each
 * frame so it tracks live edits. Helpers are keyed by part name with a
 * `__box_` prefix so they don't collide with model node names.
 */
function PartBoundingBoxes({ state, partNames }: ShipProps) {
  const helpersRef = useRef<Record<string, THREE.Box3Helper | null>>({})
  useFrame(({ scene: rootScene }) => {
    for (const name of partNames) {
      const mesh = rootScene.getObjectByName(name)
      let helper = helpersRef.current[name]
      if (!mesh || !state.showBoxes) {
        if (helper) helper.visible = false
        continue
      }
      if (!helper) {
        const box = new THREE.Box3().setFromObject(mesh)
        helper = new THREE.Box3Helper(box, new THREE.Color(0xd8804a))
        helper.name = `__box_${name}`
        rootScene.add(helper)
        helpersRef.current[name] = helper
      }
      const box = new THREE.Box3().setFromObject(mesh)
      ;(helper.box as THREE.Box3).copy(box)
      helper.visible = true
    }
  })
  return null
}

/**
 * Global wireframe overlay — adds a wireframe-mode line on every visible
 * mesh by walking the scene each frame and attaching a per-mesh helper.
 */
function WireframeOverlay({ enabled }: { enabled: boolean }) {
  useFrame(({ scene: rootScene }) => {
    rootScene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return
      const m = obj as THREE.Mesh
      const existing = m.userData.__wireOverlay as THREE.LineSegments | undefined
      if (!enabled) {
        if (existing) existing.visible = false
        return
      }
      if (!existing) {
        const edges = new THREE.EdgesGeometry(m.geometry, 12)
        const overlay = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.25,
          }),
        )
        overlay.userData.__isWireOverlay = true
        m.add(overlay)
        m.userData.__wireOverlay = overlay
      } else {
        existing.visible = true
      }
    })
  })
  return null
}

export function EditorScene({
  state,
  partNames,
}: {
  state: EditorState
  partNames: readonly string[]
}) {
  // Key the Canvas on `state.model` so swapping rockets remounts the WebGL
  // context — clean slate for caches, materials, baselines.
  return (
    <Canvas
      key={state.model}
      camera={{ position: [4, 1.8, 5.5], fov: 38 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#0b0f14' }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 4]} intensity={1.3} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />
      <Suspense fallback={null}>
        <Environment preset="studio" />
        <Ship state={state} partNames={partNames} />
        <PartBoundingBoxes state={state} partNames={partNames} />
        <WireframeOverlay enabled={state.showWireframe} />
      </Suspense>
      {state.showAxes && <axesHelper args={[2]} />}
      {state.showGrid && (
        <gridHelper args={[10, 10, 0x556677, 0x2a3340]} position={[0, -1.55, 0]} />
      )}
      <OrbitControls
        enablePan
        enableDamping
        target={[0, 0, 0]}
        makeDefault
      />
    </Canvas>
  )
}

// Preload every registered model so swapping in the picker is instant.
for (const spec of Object.values(ROCKET_MODELS)) {
  useGLTF.preload(spec.glbUrl)
}

// Also re-export for convenience.
export type { RocketModel }
