/**
 * Sample data for the race recap story (/race/[round]/recap). The page says
 * "Sample data" until the recap is generated from a session's telemetry; the
 * shapes here are what that generator will have to fill.
 *
 * The replay itself is real: the 3D track view plays the race's position data
 * (or the demo fixture), and each chapter seeks it to its lap and picks the
 * camera and the car to follow.
 */

import type { CameraMode } from '@vismay/f1-viz/web/replay'

export interface RecapCar {
  code: string
  team: string
  color: string
}

export const RECAP_CARS: RecapCar[] = [
  { code: 'VER', team: 'Red Bull', color: '#4C8DF6' },
  { code: 'NOR', team: 'McLaren', color: '#FF8A1F' },
  { code: 'LEC', team: 'Ferrari', color: '#E8203A' },
  { code: 'RUS', team: 'Mercedes', color: '#27D3B8' },
  { code: 'ALO', team: 'Aston Martin', color: '#2FA36B' },
]

export const carColor = (code: string) => RECAP_CARS.find((c) => c.code === code)?.color ?? '#8e8e99'

export interface RecapBeat {
  label: string
  kicker: string
  /** The chapter's lap in a 57-lap race; scaled to the replayed session's length. */
  lap: number
  /** The 3D view's camera when the chapter opens (the reader can switch). */
  cam: CameraMode
  /** Cars the beat is about; the camera follows the first one. */
  focus: string[]
}

export const TOTAL_LAPS = 57

export const RECAP_BEATS: RecapBeat[] = [
  { label: 'Lights out', kicker: 'Lights out · Lap 1', lap: 1, cam: 'heli', focus: ['NOR'] },
  { label: 'The undercut', kicker: 'The undercut · Laps 18–24', lap: 18, cam: 'chase', focus: ['VER'] },
  { label: 'Wheel to wheel', kicker: 'Wheel to wheel · Lap 34', lap: 34, cam: 'pov', focus: ['VER', 'NOR'] },
  { label: 'Chequered flag', kicker: 'Chequered flag · Lap 57', lap: 57, cam: 'tv', focus: ['NOR'] },
]

/** 01 — positions gained (+) or lost (−) between lights out and Turn 1. */
export const LAP1_DELTAS: { code: string; delta: number }[] = [
  { code: 'NOR', delta: 2 },
  { code: 'RUS', delta: 1 },
  { code: 'LEC', delta: 0 },
  { code: 'VER', delta: -1 },
  { code: 'ALO', delta: -2 },
]

/** 02 — gap from VER to NOR in seconds (positive = VER behind), laps 12–28. */
export const UNDERCUT_GAP: { lap: number; gap: number }[] = [
  [12, 2.1], [13, 2.0], [14, 1.9], [15, 1.9], [16, 1.8], [17, 1.7], [18, 1.4], [19, 0.9],
  [20, 0.4], [21, -0.6], [22, -0.9], [23, -1.1], [24, -1.2], [25, -1.4], [26, -1.5], [27, -1.6], [28, -1.8],
].map(([lap, gap]) => ({ lap, gap }))

export const UNDERCUT_PITS = { VER: 18, NOR: 21 }

export const UNDERCUT_TILES: { value: string; label: string; highlight?: boolean }[] = [
  { value: '2.4s', label: 'VER stop · L18' },
  { value: '2.9s', label: 'NOR stop · L21' },
  { value: '3.9s', label: 'Net swing', highlight: true },
]

/**
 * 03 — speed through Turn 4 on lap 34, km/h against distance (0–1 across the
 * chart). NOW marks where the replay frame sits.
 */
export const T4_TRACES: Record<'VER' | 'NOR', [number, number][]> = {
  // VER brakes later and lower; NOR carries more minimum speed and is back on
  // the throttle first.
  VER: [[0, 316], [0.125, 321], [0.25, 324], [0.333, 298], [0.375, 215], [0.417, 138], [0.458, 108], [0.521, 120], [0.604, 178], [0.708, 232], [0.813, 268], [0.917, 291], [1, 304]],
  NOR: [[0, 318], [0.125, 322], [0.25, 325], [0.313, 300], [0.354, 220], [0.396, 140], [0.438, 112], [0.5, 118], [0.583, 170], [0.688, 225], [0.792, 262], [0.896, 288], [1, 302]],
}
export const T4_NOW = 0.792
export const T4_APEX = 0.442

export interface DriverTelemetry {
  code: 'VER' | 'NOR'
  speed: number
  gear: number
  throttle: number
  brake: number
  drs?: boolean
  delta?: string
}

export const T4_TELEMETRY: DriverTelemetry[] = [
  { code: 'VER', speed: 262, gear: 7, throttle: 100, brake: 0, drs: true },
  { code: 'NOR', speed: 261, gear: 7, throttle: 96, brake: 0, delta: '+0.08s' },
]

/** 04 — the top five at the flag. */
export const RESULTS: { pos: number; code: string; gap: string; pts: number }[] = [
  { pos: 1, code: 'NOR', gap: 'Winner', pts: 25 },
  { pos: 2, code: 'VER', gap: '+1.6s', pts: 18 },
  { pos: 3, code: 'LEC', gap: '+8.4s', pts: 15 },
  { pos: 4, code: 'RUS', gap: '+12.1s', pts: 12 },
  { pos: 5, code: 'ALO', gap: '+27.9s', pts: 10 },
]

export const FASTEST_LAP = { code: 'VER', time: '1:31.447', lap: 49 }
