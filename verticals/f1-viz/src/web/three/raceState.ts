/**
 * Per-frame race state shared by the cars and the camera rig.
 *
 * `RaceLayout` fills it once per frame (before anything else renders): every
 * car's smoothed position, heading, speed and steering, after pushing apart
 * any cars whose bodies would overlap. Cars and cameras then read the same
 * numbers, so the onboard camera sits exactly in the car it shows.
 */
import * as THREE from 'three'
import type { CameraMode, ShotKind } from './cameraModes'

export type { CameraMode, ShotKind }

export interface CarState {
  driverNumber: number
  /** Toggled visible and inside its telemetry window at this instant. */
  active: boolean
  /** World position of the car origin (centre, on the ground) after separation. */
  pos: THREE.Vector3
  /** Telemetry position before separation. */
  raw: THREE.Vector3
  /** Yaw (rotation.y; the model faces +Z). */
  heading: number
  /** Nose-up pitch (radians) from the track gradient. */
  pitch: number
  /** m/s */
  speed: number
  /** m/s², negative = braking */
  accel: number
  /** 1/m, positive = turning left */
  curvature: number
  /** Smoothed geometric front-wheel angle (radians, positive = left). */
  steer: number
  lap: number
  /** 0 on track, 1 off track, 2 in pit. */
  status: number
  /** Smoothed separation offset currently applied (world XZ). */
  offX: number
  offZ: number
}

export interface RaceState {
  /** Playback time (ms) the state was computed for. */
  t: number
  cars: CarState[]
  byNumber: Map<number, CarState>
  /** Car model scale multiplier (1 = true scale); >1 only in the overview. */
  boost: number
  /** Camera mode in effect, and the car it is riding/following (null = none). */
  mode: CameraMode
  cameraTarget: number | null
  /** The shot currently on screen (auto mode switches between these). */
  shot: ShotKind | null
}

export function createRaceState(driverNumbers: number[]): RaceState {
  const cars = driverNumbers.map<CarState>((driverNumber) => ({
    driverNumber,
    active: false,
    pos: new THREE.Vector3(),
    raw: new THREE.Vector3(),
    heading: 0,
    pitch: 0,
    speed: 0,
    accel: 0,
    curvature: 0,
    steer: 0,
    lap: 0,
    status: 0,
    offX: 0,
    offZ: 0,
  }))
  return {
    t: 0,
    cars,
    byNumber: new Map(cars.map((c) => [c.driverNumber, c])),
    boost: 1,
    mode: 'orbit',
    cameraTarget: null,
    shot: null,
  }
}

/** Shortest signed difference between two angles. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Frame-rate independent exponential smoothing factor for time constant `tau` (s). */
export function smoothing(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau)
}
