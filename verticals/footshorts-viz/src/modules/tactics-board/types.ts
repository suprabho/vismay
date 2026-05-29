/**
 * Canonical tactical-phase types for the `fs:tactics-board` viz module.
 *
 * Mirrors the provider-agnostic shape defined in `footshorts-data/types/tactics.ts`
 * — every data source (hand-authored JSON, Statsbomb, Opta, Skillcorner, …) is
 * normalised to this before it reaches the renderer. The board is the ONLY place
 * the coordinate convention is interpreted.
 *
 * Coordinate system:
 *   - x: 0 (defending goal line) → 100 (attacking goal line)
 *   - y: 0 (right touchline)     → 100 (left touchline)
 *   - Time in seconds from phase start.
 */

export type Team = 'home' | 'away'

export interface PlayerSnapshot {
  id: string
  x: number
  y: number
  team: Team
  /** Optional short label override; defaults to a humanised `id`. */
  label?: string
}

export interface Frame {
  /** Seconds from phase start. */
  t: number
  ball: { x: number; y: number }
  players: PlayerSnapshot[]
}

export interface PassAnnotation {
  type: 'pass'
  from: string
  to: string
  /** When the pass starts, in seconds. */
  at: number
}

export interface RunAnnotation {
  type: 'run'
  playerId: string
  /** Sequence of (x, y) waypoints in data coordinates. */
  path: [number, number][]
  at: number
  duration: number
}

export interface ZoneAnnotation {
  type: 'zone'
  polygon: [number, number][]
  label?: string
  at: number
  duration: number
}

export type Annotation = PassAnnotation | RunAnnotation | ZoneAnnotation

export interface Phase {
  phaseId: string
  /** e.g. "4-2-3-1". */
  formation: string
  durationSec: number
  /** Keyframes; the renderer interpolates between them. */
  frames: Frame[]
  annotations: Annotation[]
}
