/**
 * Race-replay data contract.
 *
 * Ported from the f1_backend donor frontend (`src/config/api.ts`), trimmed to
 * what the replay render layer actually consumes. The shapes are render-library
 * agnostic and kept identical to the donor so the projector/interpolation logic
 * ports verbatim.
 *
 * Coordinate convention (from Fast-F1 / OpenF1 `/location`): x/y are raw track
 * meters, positive Y points "north". `trackProjection.buildProjector` handles
 * rotation + the Y-flip into SVG space.
 */

/** Columnar per-frame telemetry for one driver. All arrays are the same length. */
export interface CarPositionFrames {
  /** Milliseconds from session t0 (monotonic, ascending). */
  t: number[]
  /** Track-frame X (meters). */
  x: number[]
  /** Track-frame Y (meters). */
  y: number[]
  /** Track-frame Z elevation (meters); present only on elevation-enriched sessions. */
  z?: number[]
  /** Lap number at this frame. */
  lap: number[]
  /** 0 = on track, 1 = off track, 2 = in pit. */
  status: number[]
}

export interface CarPositionTrack {
  sessionKey: string
  circuitKey: string
  driverNumber: number
  sampleRateHz: number
  frameCount: number
  t0Ms: number
  tEndMs: number
  frames: CarPositionFrames
}

export interface CircuitGeometry {
  circuitKey: string
  year: number
  gpName: string
  circuitName: string
  country: string
  /** Degrees; rotation applied around the bounds center before the Y-flip. */
  rotationDeg: number
  corners: {
    number: number
    letter: string
    x: number
    y: number
    angle: number
    distance: number
  }[]
  /** Raw outline polyline in track meters (NOT an SVG path). `z` (elevation) is
   * present only on elevation-enriched sessions and drives the 3D track view. */
  outline: { x: number[]; y: number[]; z?: number[] }
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null
  /** Indices into `outline` marking the S1/S2 and S2/S3 boundaries. */
  sectorBoundaries?: { index1: number; index2: number } | null
}

export interface ProcessedLap {
  driverNumber: number
  lap: number
  lapTimeSec: number | null
  sectors: Array<number | null>
  compound: string
  stintLap: number
  events: string[]
  position?: number | null
}

export interface LapTelemetryAggregate {
  driverNumber: number
  lap: number
  avgSpeed: number
  /** Meters to the car ahead at the closest point on this lap (Infinity if none). */
  minGapToAheadM: number
}

export interface DriverSectorBest {
  s1: number
  s2: number
  s3: number
  s1Lap: number
  s2Lap: number
  s3Lap: number
}

export interface PurpleSector {
  time: number
  driverNumber: number
  lap: number
}

export interface SectorBests {
  sessionKey: string
  driverBests: Record<number, DriverSectorBest>
  sessionPurple: {
    s1: PurpleSector | null
    s2: PurpleSector | null
    s3: PurpleSector | null
  }
}

export interface RaceDriver {
  driverNumber: number
  fullName: string
  abbreviation: string
  teamName: string
  teamId?: string
  /** Hex with leading '#'. */
  teamColour: string
  championshipPosition?: number | null
  championshipPoints?: number | null
  championshipWins?: number | null
}

export interface SessionDetail {
  sessionKey: string
  sessionName: string
  circuitName: string
  country: string
  year: number
  circuitKey: string
  drivers: RaceDriver[]
}

export type AggregatesByDriverLap = Map<number, Map<number, LapTelemetryAggregate>>

/**
 * The complete payload a `ReplayDataSource` returns for one session — exactly
 * what `useReplayData` needs to drive the replay. This is also the on-disk
 * fixture shape (with Maps serialized as arrays; see `dataSource.ts`).
 */
export interface ReplaySessionData {
  session: SessionDetail
  circuit: CircuitGeometry | null
  /** Per-driver position tracks, keyed by driverNumber. */
  tracks: Map<number, CarPositionTrack>
  aggregates: AggregatesByDriverLap
  sectorBests: SectorBests | null
}
