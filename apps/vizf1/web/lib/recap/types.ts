/**
 * The race recap contract: what /api/recap/<sessionKey> returns and the recap
 * page (/race/[round]/recap) renders. Built from a race's stored telemetry by
 * ./buildRecap; ./sampleRecap is the same shape with sample numbers, shown
 * when a race has no telemetry yet.
 *
 * Pure types (no runtime imports), so client and server share them.
 */

import type { CameraMode } from '@vismay/f1-viz/web/replay'

export interface RecapDriver {
  number: number
  /** Three-letter code, e.g. "NOR". */
  code: string
  /** Surname for prose, e.g. "Norris". */
  name: string
  team: string
  /** Team colour, "#rrggbb". */
  color: string
}

/** Where a chapter puts the 3D replay. */
export interface RecapReplayCue {
  /** Lap to seek to (its start), in the race's own lap numbers. */
  lap: number
  /** Exact session time to seek to instead (ms, the replay's clock), when known. */
  atMs?: number
  cam: CameraMode
  /** Code of the car the camera follows. */
  focus: string | null
}

interface ChapterBase {
  /** Short label for the chapter nav, e.g. "Lights out". */
  label: string
  /** Line above the headline, e.g. "Lights out · Lap 1". */
  kicker: string
  headline: string
  dek: string
  replay: RecapReplayCue
}

/** 01 — the opening lap: places gained and lost from the grid. */
export interface StartChapter extends ChapterBase {
  kind: 'start'
  /** The biggest mover, when someone gained places. */
  hero: { code: string; delta: number; from: number; to: number } | null
  /** Grid position minus position after lap 1 (+ = gained), biggest movers first. */
  deltas: { code: string; delta: number }[]
}

/** A pit-stop undercut or overcut: one car gets ahead of another through the stops. */
export interface PitSwingChapter extends ChapterBase {
  kind: 'pit-swing'
  /** The driver who gained the place. */
  a: string
  b: string
  /** a's gap to b at the end of each lap, seconds (+ = a behind). */
  gap: { lap: number; gap: number }[]
  pits: { code: string; lap: number }[]
  tiles: { value: string; label: string; highlight?: boolean }[]
}

export interface TraceSample {
  /** Metres from the start of the lap. */
  d: number
  /** km/h. */
  v: number
}

export interface BattleTelemetry {
  code: string
  speed: number
  gear: number
  /** 0–100. */
  throttle: number
  /** 0–100 (FastF1 brake is on/off: 0 or 100). */
  brake: number
  drs: boolean
  /** Shown top-right on the tile, e.g. "+0.21s". */
  delta?: string
}

/** On-track overtake, with both cars' speed traces through the corner where it happened. */
export interface BattleChapter extends ChapterBase {
  kind: 'battle'
  /** The passing driver. */
  a: string
  /** The driver passed. */
  b: string
  lap: number
  /** Speed against lap distance around the pass; null when the lap has no telemetry. */
  trace: {
    a: TraceSample[]
    b: TraceSample[]
    /** Lap distance where the order flipped. */
    passAt: number
    /** The passing car's slowest point in the window, labelled with its corner when known. */
    apex: { d: number; label: string } | null
    caption: string
  } | null
  /** Both cars at the moment of the pass. */
  tiles: BattleTelemetry[]
}

/** The result: top five, gaps, points and the fastest lap. */
export interface FinishChapter extends ChapterBase {
  kind: 'finish'
  results: { pos: number; code: string; gap: string; pts: number }[]
  fastestLap: { code: string; time: string; lap: number } | null
}

export type RecapChapter = StartChapter | PitSwingChapter | BattleChapter | FinishChapter

export interface RaceRecap {
  /** True for the built-in sample story (no race data behind it). */
  sample: boolean
  sessionKey: string
  gpName: string
  season: number | null
  round: number | null
  totalLaps: number
  drivers: RecapDriver[]
  chapters: RecapChapter[]
}
