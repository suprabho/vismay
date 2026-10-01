import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { CarPositionTrack } from '../replay/types'
import { buildCarMotion, emptyMotionSample, type CarMotion } from './carMotion'
import { CAR_LENGTH_M, CAR_WIDTH_M } from './carModel'
import type { CircuitIndex } from './circuitIndex'
import { separateCars, type SeparationBody } from './carSeparation'
import { angleDelta, smoothing, type RaceState } from './raceState'
import { Z_EXAGGERATION, type WorldProjector } from './track3d'

/** Wheelbase used to turn path curvature into a front-wheel angle (m). */
const WHEELBASE_M = 3.6
const MAX_STEER = 0.35
/** Gap kept between cars, as a fraction of the (boosted) body size. */
const GAP_ALONG = 0.6
const GAP_ACROSS = 0.35
/** Offsets grow fast (avoid touching) and relax slowly (no wobble). */
const OFFSET_TAU_IN = 0.06
const OFFSET_TAU_OUT = 0.5
const HEADING_TAU = 0.06
/** Half-length of the road stretch the pitch is measured over (m). */
const PITCH_BASE_M = 3

interface Props {
  tracks: Map<number, CarPositionTrack>
  visibleDrivers: Set<number>
  projector: WorldProjector
  /** Seats cars on the ribbon's surface (height + slope) when present. */
  circuit: CircuitIndex | null
  currentTimeRef: React.RefObject<number>
  state: RaceState
}

/**
 * Computes the shared `RaceState` each frame, ahead of every other frame
 * callback (priority −2): smoothed motion → world pose → collision-free
 * placement → steering. Renders nothing.
 */
export function RaceLayout({ tracks, visibleDrivers, projector, circuit, currentTimeRef, state }: Props) {
  const motions = useMemo(() => {
    const out = new Map<number, CarMotion>()
    for (const [dn, track] of tracks) out.set(dn, buildCarMotion(track))
    return out
  }, [tracks])
  const bodies = useMemo<SeparationBody[]>(
    () =>
      state.cars.map((c) => ({
        x: 0, z: 0, fx: 0, fz: 1, prevOffX: 0, prevOffZ: 0, id: c.driverNumber, outX: 0, outZ: 0,
      })),
    [state],
  )
  const sample = useMemo(() => emptyMotionSample(), [])
  const lastT = useRef<number | null>(null)
  const hints = useRef(new Map<number, number>())

  useFrame((_, delta) => {
    const t = currentTimeRef.current ?? 0
    const raceDt = lastT.current == null ? 0 : Math.abs(t - lastT.current) / 1000
    const jumped = lastT.current == null || raceDt > 1.5
    lastT.current = t
    state.t = t
    // Smooth on whichever clock moved more: on a slow device the race can
    // advance several hundred ms between frames.
    const dt = Math.max(Math.min(delta, 0.1), raceDt)

    const active: SeparationBody[] = []
    state.cars.forEach((car, i) => {
      const motion = motions.get(car.driverNumber)
      if (!motion || !visibleDrivers.has(car.driverNumber) || !motion.sample(t, sample).ok) {
        car.active = false
        return
      }
      car.active = true
      const hasZ = Number.isFinite(sample.z)
      const [wx, wy, wz] = projector.toWorld(sample.x, sample.y, hasZ ? sample.z : undefined)
      let y = projector.hasElevation ? (hasZ ? wy : projector.nearestY(sample.x, sample.y)) : 0
      // The car's own GPS height wanders ±0.6 m (×2 exaggerated) from the
      // ribbon's — enough to bury the wheels or float a true-scale car — so
      // sit it on the road surface and take the road's slope for pitch.
      let pitch = projector.hasElevation ? Math.atan(sample.grade * Z_EXAGGERATION) : 0
      if (circuit && projector.hasElevation) {
        const hit = circuit.locate(wx, wz, jumped ? undefined : hints.current.get(car.driverNumber), y)
        hints.current.set(car.driverNumber, hit.index)
        y = circuit.heightAt(hit.s)
        pitch = Math.atan((circuit.heightAt(hit.s + PITCH_BASE_M) - circuit.heightAt(hit.s - PITCH_BASE_M)) / (2 * PITCH_BASE_M))
      }
      car.raw.set(wx, y, wz)
      // Heading: map the track-frame direction through the projector (rigid).
      const [ax, , az] = projector.toWorld(sample.x + sample.dirX * 100, sample.y + sample.dirY * 100)
      const [ox, , oz] = projector.toWorld(sample.x, sample.y)
      const hx = ax - ox
      const hz = az - oz
      if (hx * hx + hz * hz > 1e-9) {
        // A touch of smoothing absorbs the odd residual flick in the feed.
        const heading = Math.atan2(hx, hz)
        car.heading = jumped ? heading : car.heading + angleDelta(car.heading, heading) * smoothing(dt, HEADING_TAU)
      }
      car.pitch = jumped ? pitch : car.pitch + (pitch - car.pitch) * smoothing(dt, 0.15)
      car.speed = sample.speed
      car.accel = sample.accel
      car.curvature = sample.curvature
      car.lap = sample.lap
      car.status = sample.status
      // Steering from path curvature (bicycle model); hold it when crawling.
      if (sample.speed > 3) {
        const target = Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan(WHEELBASE_M * sample.curvature)))
        car.steer = jumped ? target : car.steer + (target - car.steer) * smoothing(dt, 0.12)
      }
      const b = bodies[i]
      b.x = wx
      b.z = wz
      b.fx = Math.sin(car.heading)
      b.fz = Math.cos(car.heading)
      b.prevOffX = car.offX
      b.prevOffZ = car.offZ
      active.push(b)
    })

    const k = state.boost
    separateCars(active, {
      length: CAR_LENGTH_M * k * (1 + GAP_ALONG / CAR_LENGTH_M),
      width: CAR_WIDTH_M * k * (1 + GAP_ACROSS / CAR_WIDTH_M),
      maxOffset: 6 * k,
    })

    state.cars.forEach((car, i) => {
      if (!car.active) {
        car.offX = 0
        car.offZ = 0
        return
      }
      const b = bodies[i]
      if (jumped) {
        car.offX = b.outX
        car.offZ = b.outZ
      } else {
        const growing = b.outX * b.outX + b.outZ * b.outZ > car.offX * car.offX + car.offZ * car.offZ
        const a = smoothing(dt, growing ? OFFSET_TAU_IN : OFFSET_TAU_OUT)
        car.offX += (b.outX - car.offX) * a
        car.offZ += (b.outZ - car.offZ) * a
      }
      car.pos.set(car.raw.x + car.offX, car.raw.y, car.raw.z + car.offZ)
    })
  }, -2)

  return null
}
