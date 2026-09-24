import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCarModel, cloneCarModel } from './carModel'
import type { CarPositionTrack, RaceDriver } from '../replay/types'
import { interpolateFrame } from '../replay/trackProjection'
import type { WorldProjector } from './track3d'

const EMA_ALPHA = 0.25 // elevation smoothing — kills 4 Hz GPS-Z steps

interface MarkersProps {
  modelUrl?: string
  drivers: RaceDriver[]
  tracks: Map<number, CarPositionTrack>
  visibleDrivers: Set<number>
  focusedDriver: number | null
  projector: WorldProjector
  currentTimeRef: React.RefObject<number>
  /** Chase view: car-scale markers, only the focused car labelled. */
  chase?: boolean
}

export function CarMarkers({ modelUrl, drivers, tracks, visibleDrivers, focusedDriver, projector, currentTimeRef, chase = false }: MarkersProps) {
  const model = useCarModel(modelUrl)
  return (
    <>
      {drivers.map((d) => (
        <CarMarker
          key={d.driverNumber}
          model={model}
          useModel={!!modelUrl}
          driver={d}
          track={tracks.get(d.driverNumber) ?? null}
          visible={visibleDrivers.has(d.driverNumber)}
          focused={d.driverNumber === focusedDriver}
          projector={projector}
          currentTimeRef={currentTimeRef}
          chase={chase}
        />
      ))}
    </>
  )
}

/** Bake an abbreviation label (team-coloured, dark halo) into a sprite texture once. */
function makeLabelTexture(label: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 128, 64)
    ctx.font = 'bold 40px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    ctx.strokeText(label, 64, 32)
    ctx.fillStyle = color || '#ffffff'
    ctx.fillText(label, 64, 32)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  return tex
}

interface MarkerProps {
  model: THREE.Group | null
  useModel: boolean
  driver: RaceDriver
  track: CarPositionTrack | null
  visible: boolean
  focused: boolean
  projector: WorldProjector
  currentTimeRef: React.RefObject<number>
  chase: boolean
}

/** Marker radius in chase mode — roughly an F1 car's footprint. */
const CHASE_CAR_RADIUS = 3

function CarMarker({ model, useModel, driver, track, visible, focused, projector, currentTimeRef, chase }: MarkerProps) {
  const color = driver.teamColour || '#9CA3AF'
  const car = useMemo(() => (model ? cloneCarModel(model, color) : null), [model, color])
  useEffect(() => () => car?.materials.forEach((m) => m.dispose()), [car])
  const headingRef = useRef<THREE.Group>(null)
  const groupRef = useRef<THREE.Group>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const emaY = useRef<number | null>(null)

  // Overview markers are sized for the whole circuit (~17 m spheres at
  // Melbourne scale). A chase camera sits a few car-lengths back, where those
  // balloon into a wall of overlapping spheres and labels — so chase mode
  // uses car-scale markers (~6 m) and labels only the focused car.
  const carRadius = chase ? CHASE_CAR_RADIUS : Math.max(7, projector.radius * 0.013)
  const showLabel = !chase || focused
  const carLift = useModel ? 0.15 : carRadius
  const texture = useMemo(
    () => makeLabelTexture(driver.abbreviation || String(driver.driverNumber), color),
    [driver.abbreviation, driver.driverNumber, color],
  )
  useEffect(() => () => texture.dispose(), [texture])

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    if (!visible || !track) {
      g.visible = false
      return
    }
    const t = currentTimeRef.current ?? 0
    const frame = interpolateFrame(track, t)
    if (!frame.ok) {
      g.visible = false
      return
    }
    g.visible = true

    const [wx, wy, wz] = projector.toWorld(frame.x, frame.y, frame.z)
    const targetY = projector.hasElevation
      ? frame.z != null
        ? wy
        : projector.nearestY(frame.x, frame.y)
      : 0
    emaY.current = emaY.current == null ? targetY : emaY.current + EMA_ALPHA * (targetY - emaY.current)
    g.position.set(wx, emaY.current + carLift, wz)
    g.scale.setScalar(focused ? (chase ? 1.3 : 1.6) : 1)

    // The supplied RB22 points along +Z. Use a centred telemetry tangent,
    // including the last sample; keep the heading while stationary.
    if (headingRef.current) {
      const before = interpolateFrame(track, Math.max(track.frames.t[0], t - 150))
      const after = interpolateFrame(track, t + 150)
      if (before.ok && after.ok) {
        const [bx, , bz] = projector.toWorld(before.x, before.y)
        const [ax, , az] = projector.toWorld(after.x, after.y)
        if (Math.hypot(ax - bx, az - bz) > 0.01) {
          headingRef.current.rotation.y = Math.atan2(ax - bx, az - bz)
        }
      }
    }
    const inPit = frame.status === 2
    car?.materials.forEach((m) => { m.opacity = inPit ? 0.4 : 1 })
    const off = frame.status === 1
    if (matRef.current) matRef.current.opacity = inPit ? 0.4 : 1
    if (ringRef.current) {
      ringRef.current.visible = focused || off
      ;(ringRef.current.material as THREE.MeshBasicMaterial).color.set(off ? '#F59E0B' : '#ffffff')
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      {useModel ? (
        <group ref={headingRef} scale={carRadius * 2}>
          {car ? <primitive object={car.scene} dispose={null} /> : (
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[0.38, 0.2, 1]} />
              <meshStandardMaterial ref={matRef} color={color} transparent />
            </mesh>
          )}
        </group>
      ) : (
        <mesh>
          <sphereGeometry args={[carRadius, 16, 16]} />
          <meshStandardMaterial ref={matRef} color={color} emissive={color} emissiveIntensity={focused ? 0.6 : 0.45} transparent />
        </mesh>
      )}
      <mesh ref={ringRef} position={[0, useModel ? carRadius * 0.25 : 0, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[carRadius * 1.7, carRadius * 0.22, 8, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {showLabel && (
        <sprite position={[0, carRadius * 2.8, 0]} scale={[carRadius * 5, carRadius * 2.5, 1]}>
          <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
        </sprite>
      )}
    </group>
  )
}
