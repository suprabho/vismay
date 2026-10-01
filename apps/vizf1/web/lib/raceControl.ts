import type { RaceEventKind, RaceEventPeriod, RacePitStop } from '@vismay/f1-viz/web'

/**
 * Pure parsers turning OpenF1 race-control + pit rows (or, failing those, the
 * ingested lap flags + stints) into lap-keyed `RaceEvents` periods and stops.
 * Kept free of I/O so the events route stays thin and this stays testable.
 */

/** OpenF1 `/race_control` row (the fields we read). */
export interface RaceControlRow {
  date?: string | null
  lap_number?: number | null
  category?: string | null
  flag?: string | null
  scope?: string | null
  sector?: number | null
  message?: string | null
}

/** OpenF1 `/pit` row. `pit_duration` is the pre-2025 name for the lane time. */
export interface PitRow {
  driver_number?: number | null
  lap_number?: number | null
  pit_duration?: number | null
  lane_duration?: number | null
  stop_duration?: number | null
}

/** A lane time this long is a red-flag stoppage in the pit lane, not a stop. */
const MAX_LANE_SEC = 100

interface Open {
  start: number
  message?: string
}

export function parseRaceControl(rows: RaceControlRow[]): RaceEventPeriod[] {
  const sorted = [...rows].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const out: RaceEventPeriod[] = []
  let lastLap = 1
  let sc: (Open & { kind: 'SC' | 'VSC' }) | null = null
  let red: Open | null = null
  const yellows = new Map<string, Open>()

  const close = (kind: RaceEventKind, o: Open, endLap: number) =>
    out.push({ kind, startLap: o.start, endLap: Math.max(o.start, endLap), ...(o.message ? { message: o.message } : {}) })
  const closeYellows = (lap: number) => {
    for (const y of yellows.values()) close('YELLOW', y, lap)
    yellows.clear()
  }

  for (const m of sorted) {
    const lap = m.lap_number != null && m.lap_number > 0 ? m.lap_number : lastLap
    lastLap = lap
    const category = (m.category ?? '').toUpperCase()
    const flag = (m.flag ?? '').toUpperCase()
    const text = (m.message ?? '').toUpperCase()
    const message = m.message ?? undefined

    if (category === 'SAFETYCAR') {
      if (text.includes('DEPLOYED')) {
        // A VSC upgraded to a full SC closes the VSC where the SC starts.
        if (sc) close(sc.kind, sc, lap)
        sc = { kind: text.includes('VIRTUAL') ? 'VSC' : 'SC', start: lap, message }
      } else if (sc && (text.includes('ENDING') || text.includes('IN THIS LAP'))) {
        close(sc.kind, sc, lap)
        sc = null
      }
      continue
    }
    if (category !== 'FLAG') continue

    const sectorKey = m.sector != null ? `s${m.sector}` : 'track'
    if (flag === 'RED') {
      red ??= { start: lap, message }
    } else if (flag === 'YELLOW' || flag === 'DOUBLE YELLOW') {
      if (!yellows.has(sectorKey)) yellows.set(sectorKey, { start: lap, message })
    } else if (flag === 'CLEAR') {
      if (sectorKey === 'track') closeYellows(lap)
      else {
        const y = yellows.get(sectorKey)
        if (y) close('YELLOW', y, lap)
        yellows.delete(sectorKey)
      }
    } else if (flag === 'GREEN' || flag === 'CHEQUERED') {
      // Track green (a restart) or the flag clears every open flag period.
      if ((m.scope ?? '').toUpperCase() === 'TRACK' || flag === 'CHEQUERED') {
        if (red) close('RED', red, lap)
        red = null
        closeYellows(lap)
      }
    }
  }

  if (sc) close(sc.kind, sc, lastLap)
  if (red) close('RED', red, lastLap)
  closeYellows(lastLap)
  return tidyPeriods(out)
}

/**
 * Merge overlapping periods of the same kind, and drop yellows that sit fully
 * inside a neutralisation (a yellow under the SC adds nothing to the picture).
 */
export function tidyPeriods(periods: RaceEventPeriod[]): RaceEventPeriod[] {
  const byKind = new Map<RaceEventKind, RaceEventPeriod[]>()
  for (const p of periods) {
    const list = byKind.get(p.kind) ?? []
    list.push({ ...p })
    byKind.set(p.kind, list)
  }
  const merged: RaceEventPeriod[] = []
  for (const list of byKind.values()) {
    list.sort((a, b) => a.startLap - b.startLap)
    let cur: RaceEventPeriod | null = null
    for (const p of list) {
      if (cur && p.startLap <= cur.endLap + (p.kind === 'YELLOW' ? 1 : 0)) {
        cur.endLap = Math.max(cur.endLap, p.endLap)
      } else {
        if (cur) merged.push(cur)
        cur = p
      }
    }
    if (cur) merged.push(cur)
  }
  const neutralised = merged.filter((p) => p.kind !== 'YELLOW')
  return merged
    .filter(
      (p) => p.kind !== 'YELLOW' || !neutralised.some((n) => p.startLap >= n.startLap && p.endLap <= n.endLap),
    )
    .sort((a, b) => a.startLap - b.startLap)
}

export function parsePits(rows: PitRow[]): RacePitStop[] {
  const out: RacePitStop[] = []
  for (const r of rows) {
    if (r.driver_number == null || r.lap_number == null) continue
    const lane = r.lane_duration ?? r.pit_duration ?? null
    if (lane != null && lane > MAX_LANE_SEC) continue
    out.push({
      driverNumber: r.driver_number,
      lap: r.lap_number,
      laneSec: lane != null ? round1(lane) : null,
      stopSec: r.stop_duration != null && r.stop_duration > 0 ? round1(r.stop_duration) : null,
    })
  }
  return out.sort((a, b) => a.lap - b.lap || a.driverNumber - b.driverNumber)
}

/**
 * Timing-only fallback: the ingest flags laps `sc_deployed` (any safety-car
 * message that lap — SC and VSC look alike) and `pit_in`; stints carry the
 * pit-lane delta when FastF1 recorded one.
 */
export function periodsFromScLaps(laps: number[]): RaceEventPeriod[] {
  const sorted = [...new Set(laps)].sort((a, b) => a - b)
  const out: RaceEventPeriod[] = []
  for (const lap of sorted) {
    const last = out[out.length - 1]
    if (last && lap <= last.endLap + 1) last.endLap = lap
    else out.push({ kind: 'SC', startLap: lap, endLap: lap, message: 'Safety car / VSC' })
  }
  return out
}

export interface StintJson {
  driverNumber?: number
  pitInLap?: number | null
  pitDeltaSec?: number | null
}

export function pitsFromTiming(pitLaps: Array<{ driverNumber: number; lap: number }>, stints: StintJson[]): RacePitStop[] {
  const delta = new Map<string, number>()
  for (const s of stints) {
    if (s.driverNumber != null && s.pitInLap != null && s.pitDeltaSec != null && s.pitDeltaSec <= MAX_LANE_SEC) {
      delta.set(`${s.driverNumber}:${s.pitInLap}`, s.pitDeltaSec)
    }
  }
  const seen = new Set<string>()
  const out: RacePitStop[] = []
  const add = (driverNumber: number, lap: number) => {
    const key = `${driverNumber}:${lap}`
    if (seen.has(key)) return
    seen.add(key)
    const lane = delta.get(key)
    out.push({ driverNumber, lap, laneSec: lane != null ? round1(lane) : null, stopSec: null })
  }
  for (const p of pitLaps) add(p.driverNumber, p.lap)
  for (const s of stints) if (s.driverNumber != null && s.pitInLap != null) add(s.driverNumber, s.pitInLap)
  return out.sort((a, b) => a.lap - b.lap || a.driverNumber - b.driverNumber)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
