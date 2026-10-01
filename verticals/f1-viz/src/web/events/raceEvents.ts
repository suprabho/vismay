/**
 * Race events — track-status periods (safety car, virtual safety car, red and
 * yellow flags) and pit stops, keyed by lap so the lap-time chart and the
 * telemetry clip can overlay them without a shared clock.
 *
 * JSON-native: the vizf1 app assembles this from OpenF1 race control + pit data
 * (falling back to the ingested lap flags + stints) and hands it to the modules
 * inline — the modules never fetch it themselves.
 */

export type RaceEventKind = 'RED' | 'SC' | 'VSC' | 'YELLOW'

export interface RaceEventPeriod {
  kind: RaceEventKind
  /** Leader lap the period started on. */
  startLap: number
  /** Leader lap the period ended on (inclusive; == startLap for a one-lap period). */
  endLap: number
  /** Race-control message that opened the period, e.g. "SAFETY CAR DEPLOYED". */
  message?: string
}

export interface RacePitStop {
  driverNumber: number
  /** Lap the driver entered the pit lane on (their in-lap). */
  lap: number
  /** Pit-lane time, entry to exit (s). */
  laneSec: number | null
  /** Stationary time in the box (s) — OpenF1 only, 2024 onwards. */
  stopSec: number | null
}

export interface RaceEvents {
  /** 'openf1' = race-control feed; 'timing' = derived from ingested lap flags (SC and VSC not told apart). */
  source: 'openf1' | 'timing'
  periods: RaceEventPeriod[]
  pitStops: RacePitStop[]
}

export const RACE_EVENT_STYLE: Record<RaceEventKind, { label: string; short: string; color: string }> = {
  RED: { label: 'Red flag', short: 'RED', color: '#ef4444' },
  SC: { label: 'Safety car', short: 'SC', color: '#f97316' },
  VSC: { label: 'Virtual safety car', short: 'VSC', color: '#eab308' },
  YELLOW: { label: 'Yellow flag', short: 'YEL', color: '#fde047' },
}

/** Most severe first — when periods overlap, the more severe one is what's shown. */
export const RACE_EVENT_KINDS: RaceEventKind[] = ['RED', 'SC', 'VSC', 'YELLOW']

/** The most severe period covering `lap`, or null under green. */
export function periodAtLap(periods: RaceEventPeriod[] | undefined, lap: number): RaceEventPeriod | null {
  if (!periods?.length) return null
  let best: RaceEventPeriod | null = null
  for (const p of periods) {
    if (lap < p.startLap || lap > p.endLap) continue
    if (!best || RACE_EVENT_KINDS.indexOf(p.kind) < RACE_EVENT_KINDS.indexOf(best.kind)) best = p
  }
  return best
}

/** "2.4s stop" / "22.1s lane" / "pit" — the most specific time a stop has. */
export function formatPitTime(stop: RacePitStop): string {
  if (stop.stopSec != null) return `${stop.stopSec.toFixed(1)}s`
  if (stop.laneSec != null) return `${stop.laneSec.toFixed(1)}s lane`
  return 'pit'
}
