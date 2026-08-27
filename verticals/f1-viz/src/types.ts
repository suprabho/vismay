/**
 * F1-domain types shared across @vismay/f1-viz components.
 *
 * Mirrors the Jolpica-F1 (Ergast-compatible) payload shapes consumed by
 * @vizf1/web's hooks. Kept here so the vertical owns the F1 data contract
 * and presentational components can be consumed from any app without
 * reaching back into a specific app's lib/. App hooks (useSchedule,
 * useDriverStandings, useLapPositions) re-export these types so existing
 * call sites keep working.
 */

export type RaceStatus = 'upcoming' | 'live' | 'finished' | 'canceled'

export type RaceRow = {
  /** Composite key — `${season}-${round}`. */
  id: string
  season: string
  round: number
  raceName: string
  circuitId: string
  circuitName: string
  country: string
  locality: string | null
  /** ISO `YYYY-MM-DD` of the race day. */
  date: string
  /** ISO time of the race start in UTC, e.g. `13:00:00Z`. May be null for very-early-season placeholders. */
  time: string | null
  status: RaceStatus
  /** True when the weekend includes a sprint (Sprint Q + Sprint). */
  hasSprint: boolean
}

export type DriverStandingRow = {
  position: number
  driverId: string
  driverCode: string | null
  driverName: string
  constructorId: string
  constructorName: string
  /** Constructor primary colour (e.g. `#27F4D2`). Used to tint standings rows. */
  constructorColor: string | null
  /** Driver headshot URL. */
  headshotUrl: string | null
  points: number
  wins: number
}

export type ConstructorStandingRow = {
  position: number
  constructorId: string
  constructorName: string
  nationality: string | null
  /** Constructor primary colour (e.g. `#27F4D2`). Used to tint standings rows. */
  primaryColor: string | null
  /** Team logo URL — usually a Wikimedia/CDN SVG. */
  logoUrl: string | null
  points: number
  wins: number
}

export type LapPosition = {
  lap: number
  position: number
}

export type DriverLane = {
  driverId: string
  driverCode: string | null
  driverName: string
  /** Hex string used to colour the polyline; usually constructor accent. */
  color: string
  /** Driver headshot URL for the end-of-line avatar. Null → initials monogram. */
  headshotUrl?: string | null
  points: LapPosition[]
}

export type RaceResultRow = {
  position: number
  driverId: string
  driverCode: string | null
  driverName: string
  constructorId: string
  constructorName: string
  /** Final grid position. */
  grid: number
  /** Laps completed. */
  laps: number
  /** "Finished" / "+1 Lap" / "Retired" etc. */
  status: string
  /** Race-time string if finished, else null. */
  time: string | null
  points: number
}

export type QualifyingRow = {
  position: number
  driverId: string
  driverCode: string | null
  driverName: string
  constructorId: string
  constructorName: string
  /** Constructor primary colour (e.g. `#27F4D2`). Tints the driver chip + team. */
  constructorColor?: string | null
  q1: string | null
  q2: string | null
  q3: string | null
}

// TODO(vizf1-scaffold): wire f1:fp-results module — types for FP sessions are
// not in the Ergast surface. Likely needs OpenF1 or a future Jolpica endpoint.
export type FPResultRow = {
  position: number
  driverId: string
  driverName: string
  bestLap: string | null
  laps: number
}

// TODO(vizf1-scaffold): wire f1:sprint-results module once the scaffold's
// sprint hook exists. Sprint payload mirrors RaceResultRow with fewer points.
export type SprintResultRow = RaceResultRow
