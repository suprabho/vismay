import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CAR_LENGTH_M, CAR_WIDTH_M, cloneCarModel, useCarModel, type CarModelTemplate } from './carModel'
import type { RaceDriver } from '../replay/types'
import type { RaceState } from './raceState'

/**
 * Front wheels read better slightly exaggerated (pure geometry is only ~4° in
 * a fast corner); the steering wheel turns ~9× the road-wheel angle.
 */
const WHEEL_STEER_GAIN = 1.5
const MAX_WHEEL_STEER = 0.42
const STEERING_RATIO = 9
const MAX_STEERING_WHEEL = 2.8

interface MarkersProps {
  modelUrl?: string
  drivers: RaceDriver[]
  focusedDriver: number | null
  state: RaceState
}

export function CarMarkers({ modelUrl, drivers, focusedDriver, state }: MarkersProps) {
  const model = useCarModel(modelUrl)
  return (
    <>
      {drivers.map((d) => (
        <CarMarker
          key={d.driverNumber}
          model={model}
          useModel={!!modelUrl}
          driver={d}
          focused={d.driverNumber === focusedDriver}
          state={state}
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
  model: CarModelTemplate | null
  useModel: boolean
  driver: RaceDriver
  focused: boolean
  state: RaceState
}

/** Sphere marker radius (true scale) when no car model is configured. */
const SPHERE_RADIUS = 1.4
/** Label width at true scale (m), and its floor as a fraction of the view height. */
const LABEL_W = 3.6
const LABEL_SCREEN = 0.06
const LABEL_SCREEN_MAX = 0.14
const FOLLOW_LABEL_RANGE_M = 350
const CAR_HEIGHT_M = 1.2

function clamp(v: number, limit: number) {
  return Math.max(-limit, Math.min(limit, v))
}

function CarMarker({ model, useModel, driver, focused, state }: MarkerProps) {
  const color = driver.teamColour || '#9CA3AF'
  const car = useMemo(() => (model ? cloneCarModel(model, color) : null), [model, color])
  useEffect(() => () => car?.materials.forEach((m) => m.dispose()), [car])
  const groupRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const labelRef = useRef<THREE.Sprite>(null)
  const camera = useThree((s) => s.camera)
  const texture = useMemo(
    () => makeLabelTexture(driver.abbreviation || String(driver.driverNumber), color),
    [driver.abbreviation, driver.driverNumber, color],
  )
  useEffect(() => () => texture.dispose(), [texture])

  useFrame(() => {
    const g = groupRef.current
    const cs = state.byNumber.get(driver.driverNumber)
    if (!g) return
    if (!cs || !cs.active) {
      g.visible = false
      return
    }
    g.visible = true
    const k = state.boost
    const overview = state.mode === 'orbit'
    // Close-up shots of this car: its own label would fill the frame (the HUD names it).
    const closeUp = state.cameraTarget === driver.driverNumber && (state.shot === 'pov' || state.shot === 'chase')
    g.position.copy(cs.pos)
    g.scale.setScalar(k)

    if (bodyRef.current) {
      bodyRef.current.rotation.set(-cs.pitch, cs.heading, 0, 'YXZ')
    }
    if (car) {
      // + steer = turning left: front wheels yaw left, the wheel turns anticlockwise.
      const wheel = clamp(cs.steer * WHEEL_STEER_GAIN, MAX_WHEEL_STEER)
      if (car.wheelFL) car.wheelFL.rotation.y = wheel
      if (car.wheelFR) car.wheelFR.rotation.y = wheel
      if (car.steering) car.steering.rotation.z = -clamp(cs.steer * STEERING_RATIO, MAX_STEERING_WHEEL)
    }

    const inPit = cs.status === 2
    car?.materials.forEach((m) => { m.opacity = inPit ? 0.4 : 1 })
    if (matRef.current) matRef.current.opacity = inPit ? 0.4 : 1
    const off = cs.status === 1
    if (ringRef.current) {
      ringRef.current.visible = overview && (focused || off)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).color.set(off ? '#F59E0B' : '#ffffff')
    }
    const label = labelRef.current
    if (label) {
      // Every car labelled except the one in a close-up. True size up close,
      // but never smaller than a fixed share of the screen.
      const dist = g.position.distanceTo(camera.position)
      // Following a car, distant labels just stack up along the horizon.
      label.visible = !closeUp && (overview || dist < FOLLOW_LABEL_RANGE_M)
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 50
      const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov / 2))
      // …and never more than a sliver of the frame for a car right by the lens.
      const w = Math.min(Math.max(LABEL_W, viewH * LABEL_SCREEN), viewH * LABEL_SCREEN_MAX)
      label.scale.set(w / k, w / 2 / k, 1)
      label.position.y = (CAR_HEIGHT_M * k + w * 0.3) / k
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <group ref={bodyRef}>
        {useModel ? (
          car ? <primitive object={car.scene} dispose={null} /> : (
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[CAR_WIDTH_M, 0.9, CAR_LENGTH_M]} />
              <meshStandardMaterial ref={matRef} color={color} transparent />
            </mesh>
          )
        ) : (
          <mesh position={[0, SPHERE_RADIUS, 0]}>
            <sphereGeometry args={[SPHERE_RADIUS, 16, 16]} />
            <meshStandardMaterial ref={matRef} color={color} emissive={color} emissiveIntensity={focused ? 0.6 : 0.45} transparent />
          </mesh>
        )}
      </group>
      <mesh ref={ringRef} position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[CAR_LENGTH_M * 0.75, 0.35, 8, 40]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <sprite ref={labelRef} position={[0, CAR_HEIGHT_M + 1, 0]} scale={[LABEL_W, LABEL_W / 2, 1]}>
        <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  )
}
