import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { RaceDriver } from '../replay/types'
import { useCarModel } from './carModel'
import { pickTvCamera, type CircuitIndex } from './circuitIndex'
import { RaceDirector } from './director'
import { angleDelta, smoothing, type CameraMode, type RaceState, type ShotKind } from './raceState'

/** What the on-screen camera HUD shows. */
export interface CameraHudInfo {
  mode: CameraMode
  shot: ShotKind | null
  driverNumber: number | null
  abbreviation: string
  teamColour: string
  speedKmh: number
  reason: string
  partner: string | null
}

interface Props {
  mode: CameraMode
  focusedDriver: number | null
  state: RaceState
  circuit: CircuitIndex | null
  modelUrl?: string
  drivers: RaceDriver[]
  /** Disable user orbit entirely (capture/print). */
  interactive?: boolean
  onHud?: (info: CameraHudInfo) => void
}

// Shot framing, true-scale metres.
const CHASE = { back: 8.5, up: 2.7, ahead: 10, lookUp: 1, fov: 56, headingTau: 0.25 }
const HELI = { dist: 62, up: 46, ahead: 12, fov: 30, headingTau: 1.2 }
const POV = { fov: 72, lookDown: 0.17 }
/** TV: metres of track kept in frame vertically, and lens limits (deg). */
const TV = { frame: 16, minFov: 3.5, maxFov: 40, aimTau: 0.12 }
const ORBIT_FOV = 50
const ORBIT_RETURN_S = 1.1
/** Overview cars grow with zoom so they stay visible (never below true scale). */
const BOOST_PER_M = 1 / 120
const MAX_BOOST = 4.5

const DEFAULT_EYE = new THREE.Vector3(0, 1.05, -0.12)
const UP = new THREE.Vector3(0, 1, 0)
const TMP = new THREE.Vector3()
const TMP2 = new THREE.Vector3()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()

/**
 * Overview pose: look down on the circuit from the south-ish and back off
 * just far enough that every outline point fits the frame (exact, in camera
 * space), with the outline centred on screen.
 */
function fitOverview(circuit: CircuitIndex, aspect: number) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(ORBIT_FOV / 2))
  const tanH = tanV * aspect
  const back = new THREE.Vector3(0.1, 1.4, 0.6).normalize()
  const fwd = back.clone().negate()
  const right = new THREE.Vector3().crossVectors(fwd, UP).normalize()
  const up = new THREE.Vector3().crossVectors(right, fwd)
  const c = circuit.center
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of circuit.outline) {
    const dx = p[0] - c.x, dy = p[1] - c.y, dz = p[2] - c.z
    const x = dx * right.x + dy * right.y + dz * right.z
    const y = dx * up.x + dy * up.y + dz * up.z
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const target = c.clone().addScaledVector(right, (minX + maxX) / 2).addScaledVector(up, (minY + maxY) / 2)
  let dist = 1
  for (const p of circuit.outline) {
    const dx = p[0] - target.x, dy = p[1] - target.y, dz = p[2] - target.z
    const x = Math.abs(dx * right.x + dy * right.y + dz * right.z)
    const y = Math.abs(dx * up.x + dy * up.y + dz * up.z)
    const z = dx * fwd.x + dy * fwd.y + dz * fwd.z
    dist = Math.max(dist, x / tanH - z, y / tanV - z)
  }
  dist *= 1.08
  return { position: target.clone().addScaledVector(back, dist), target, far: circuit.radius * 40 }
}

/**
 * Drives the camera for every mode. Orbit is the free OrbitControls overview;
 * every other mode follows a car chosen by the `RaceDirector` (the focused
 * driver when one is picked) with a fixed shot type, and `auto` lets the
 * director cut between shot types too.
 */
export function CameraRig({ mode, focusedDriver, state, circuit, modelUrl, drivers, interactive = true, onHud }: Props) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const model = useCarModel(modelUrl)
  const director = useMemo(() => (circuit ? new RaceDirector(circuit) : null), [circuit])
  const byNumber = useMemo(() => new Map(drivers.map((d) => [d.driverNumber, d])), [drivers])

  const overview = useMemo(
    () => (circuit ? fitOverview(circuit, size.width / Math.max(1, size.height)) : null),
    [circuit, size.width, size.height],
  )

  const rig = useRef({
    shotKey: '',
    heading: 0,
    aim: new THREE.Vector3(),
    tvIndex: -1,
    tvHint: -1,
    returnT: -1,
    from: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    lastMode: null as CameraMode | null,
    hudKey: '',
    hudAt: 0,
    lastT: 0,
  })

  // Frame the whole circuit on mount / resize while in the overview.
  useEffect(() => {
    if (!overview || mode !== 'orbit' || rig.current.returnT >= 0) return
    camera.position.copy(overview.position)
    controls.current?.target.copy(overview.target)
    camera.lookAt(overview.target)
    controls.current?.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview])

  useEffect(() => {
    director?.reset()
  }, [director])

  const setLens = (fov: number, near: number, far: number) => {
    if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== near || camera.far !== far) {
      camera.fov = fov
      camera.near = near
      camera.far = far
      camera.updateProjectionMatrix()
    }
  }

  const emitHud = (info: CameraHudInfo, now: number) => {
    if (!onHud) return
    const cut = `${info.mode}|${info.shot}|${info.driverNumber}|`
    const key = `${cut}${Math.round(info.speedKmh)}|${info.reason}|${info.partner}`
    if (key === rig.current.hudKey) return
    // Speed ticks are throttled; a cut updates the caption immediately.
    if (rig.current.hudKey.startsWith(cut) && now - rig.current.hudAt < 120) return
    rig.current.hudKey = key
    rig.current.hudAt = now
    onHud(info)
  }

  useFrame((frame, delta) => {
    const r = rig.current
    // Smooth on whichever clock moved more (race time races ahead of render
    // time on slow devices, and the camera must keep up with the car).
    const raceDt = Math.abs(state.t - r.lastT) / 1000
    r.lastT = state.t
    const dt = Math.max(Math.min(delta, 0.1), raceDt < 1.5 ? raceDt : 0)
    const now = frame.clock.elapsedTime * 1000
    const ctl = controls.current
    const entering = r.lastMode !== mode
    r.lastMode = mode
    state.mode = mode

    if (mode === 'orbit' || !director || !circuit) {
      state.shot = null
      state.cameraTarget = null
      if (entering && overview && ctl && r.shotKey) {
        // Fly back out from a follow shot to the circuit overview.
        r.returnT = 0
        r.from.copy(camera.position)
        r.fromTarget.copy(TMP.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(30).add(camera.position))
      }
      r.shotKey = ''
      if (overview) setLens(ORBIT_FOV, 0.5, overview.far)
      if (r.returnT >= 0 && overview && ctl) {
        r.returnT = Math.min(1, r.returnT + Math.min(delta, 0.1) / ORBIT_RETURN_S)
        const e = r.returnT * r.returnT * (3 - 2 * r.returnT)
        camera.position.lerpVectors(r.from, overview.position, e)
        ctl.target.lerpVectors(r.fromTarget, overview.target, e)
        ctl.update()
        if (r.returnT >= 1) r.returnT = -1
      }
      const dist = ctl ? camera.position.distanceTo(ctl.target) : overview ? overview.position.distanceTo(overview.target) : 0
      const want = Math.min(MAX_BOOST, Math.max(1, dist * BOOST_PER_M))
      state.boost += (want - state.boost) * smoothing(dt, 0.25)
      emitHud({ mode, shot: null, driverNumber: null, abbreviation: '', teamColour: '', speedKmh: 0, reason: '', partner: null }, now)
      return
    }

    r.returnT = -1
    state.boost = 1
    const shot = director.update(state, state.t, mode === 'auto' ? null : mode, focusedDriver)
    const car = shot ? state.byNumber.get(shot.target) : undefined
    if (!shot || !car || !car.active) {
      state.shot = null
      state.cameraTarget = null
      return
    }
    state.shot = shot.kind
    state.cameraTarget = shot.target
    const key = `${shot.kind}:${shot.target}:${shot.since}`
    const cut = key !== r.shotKey || entering
    r.shotKey = key
    if (cut) {
      r.heading = car.heading
      r.tvIndex = -1
    }

    if (shot.kind === 'pov') {
      E.set(-car.pitch, car.heading, 0, 'YXZ')
      Q.setFromEuler(E)
      const eye = model ? TMP.fromArray(model.eye) : TMP.copy(DEFAULT_EYE)
      camera.position.copy(eye.applyQuaternion(Q).add(car.pos))
      TMP2.set(0, -POV.lookDown, 1).applyQuaternion(Q).add(camera.position)
      camera.up.copy(UP)
      camera.lookAt(TMP2)
      setLens(POV.fov, 0.05, Math.max(3000, circuit.radius * 6))
    } else if (shot.kind === 'chase' || shot.kind === 'heli') {
      const cfg = shot.kind === 'chase' ? CHASE : HELI
      r.heading += angleDelta(r.heading, car.heading) * smoothing(dt, cfg.headingTau)
      const fx = Math.sin(r.heading)
      const fz = Math.cos(r.heading)
      if (shot.kind === 'chase') {
        camera.position.set(car.pos.x - fx * CHASE.back, car.pos.y + CHASE.up, car.pos.z - fz * CHASE.back)
        TMP2.set(car.pos.x + fx * CHASE.ahead, car.pos.y + CHASE.lookUp, car.pos.z + fz * CHASE.ahead)
      } else {
        const a = r.heading + 2.35 + 0.3 * Math.sin(state.t / 7000)
        camera.position.set(car.pos.x + Math.sin(a) * HELI.dist, car.pos.y + HELI.up, car.pos.z + Math.cos(a) * HELI.dist)
        TMP2.set(car.pos.x + fx * HELI.ahead, car.pos.y, car.pos.z + fz * HELI.ahead)
      }
      camera.up.copy(UP)
      camera.lookAt(TMP2)
      setLens(cfg.fov, 0.1, Math.max(3000, circuit.radius * 6))
    } else {
      // Trackside TV camera: fixed position, pans + zooms to hold the car.
      const hit = circuit.locate(car.raw.x, car.raw.z, r.tvHint >= 0 ? r.tvHint : undefined)
      r.tvHint = hit.index
      const idx = pickTvCamera(circuit, hit.s)
      const goal = TMP.set(car.pos.x, car.pos.y + 0.8, car.pos.z)
      if (idx !== r.tvIndex) {
        r.tvIndex = idx
        r.aim.copy(goal)
      } else {
        r.aim.lerp(goal, smoothing(dt, TV.aimTau))
      }
      const cam = circuit.tvCameras[idx]
      if (cam) camera.position.copy(cam.position)
      camera.up.copy(UP)
      camera.lookAt(r.aim)
      const dist = camera.position.distanceTo(r.aim)
      const frameM = shot.partner != null ? TV.frame * 1.8 : TV.frame
      const fov = THREE.MathUtils.radToDeg(2 * Math.atan(frameM / 2 / Math.max(1, dist)))
      setLens(Math.min(TV.maxFov, Math.max(TV.minFov, fov)), 0.5, Math.max(3000, circuit.radius * 6))
    }
    if (ctl) ctl.target.copy(car.pos)

    const d = byNumber.get(shot.target)
    const partner = shot.partner != null ? byNumber.get(shot.partner) : undefined
    emitHud(
      {
        mode,
        shot: shot.kind,
        driverNumber: shot.target,
        abbreviation: d?.abbreviation || String(shot.target),
        teamColour: d?.teamColour || '#9CA3AF',
        speedKmh: car.speed * 3.6,
        reason: shot.reason,
        partner: partner ? partner.abbreviation || String(partner.driverNumber) : null,
      },
      now,
    )
    // Before the cars (priority 0) so labels size against this frame's camera;
    // after RaceLayout (−2), which this reads.
  }, -1)

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={interactive && mode === 'orbit'}
      enablePan={interactive && mode === 'orbit'}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={6}
      zoomToCursor
      dampingFactor={0.1}
    />
  )
}
