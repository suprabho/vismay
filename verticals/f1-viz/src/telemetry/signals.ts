/**
 * Telemetry signal detection — pure heuristics over the ingested telemetry
 * tables (vizf1_telemetry_laps + the session's stints/drivers JSONB).
 *
 * A "signal" is a noteworthy moment (the fastest lap, a pace drop, a close
 * battle, a tyre-deg cliff, a pit window) reduced to a lap window + the drivers
 * involved. `buildTelemetryBrief` turns the top signals into a telemetry brief
 * the compose pipeline grounds an F1 story on. Ported in spirit from the
 * f1_backend telemetry_graph detectors; thresholds are session-length-relative.
 */

export interface LapRow {
  driver_number: number
  lap: number
  lap_time_sec: number | null
  sectors: Array<number | null> | null
  compound: string | null
  min_gap_to_ahead_m: number | null
  avg_speed: number | null
  position: number | null
  events: string[] | null
}

export interface StintRow {
  driverNumber: number
  compound: string
  startLap: number
  endLap: number
  totalLaps: number
  pitInLap: number | null
  pitOutLap: number | null
  pitDeltaSec: number | null
  averageDegPerLap: number | null
}

export interface DriverRow {
  driverNumber: number
  abbreviation?: string
  fullName?: string
  teamName?: string
}

export type SignalKind = 'fastest_lap' | 'pace_drop' | 'close_battle' | 'tyre_deg' | 'pit_window'

export interface Signal {
  kind: SignalKind
  driverNumbers: number[]
  focalDriverNumber: number
  lapFrom: number
  lapTo: number
  /** 0..1 — higher is more story-worthy. */
  priority: number
  title: string
  detail: string
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function abbr(drivers: DriverRow[], dn: number): string {
  const d = drivers.find((x) => x.driverNumber === dn)
  return d?.abbreviation || d?.fullName || `#${dn}`
}

const isPitOrSc = (l: LapRow) =>
  (l.events ?? []).some((e) => e === 'pit_in' || e === 'sc_deployed' || e === 'incomplete')

export function deriveSignals(
  laps: LapRow[],
  stints: StintRow[],
  drivers: DriverRow[],
): Signal[] {
  const out: Signal[] = []
  const byDriver = new Map<number, LapRow[]>()
  for (const l of laps) {
    if (!byDriver.has(l.driver_number)) byDriver.set(l.driver_number, [])
    byDriver.get(l.driver_number)!.push(l)
  }
  for (const arr of byDriver.values()) arr.sort((a, b) => a.lap - b.lap)
  const totalLaps = laps.reduce((m, l) => Math.max(m, l.lap), 0)

  // ── Fastest lap of the session ──────────────────────────────────────────
  let fastest: LapRow | null = null
  for (const l of laps) {
    if (l.lap_time_sec && l.lap_time_sec > 0 && (!fastest || l.lap_time_sec < fastest.lap_time_sec!)) {
      fastest = l
    }
  }
  if (fastest) {
    out.push({
      kind: 'fastest_lap',
      driverNumbers: [fastest.driver_number],
      focalDriverNumber: fastest.driver_number,
      lapFrom: Math.max(1, fastest.lap - 1),
      lapTo: Math.min(totalLaps, fastest.lap + 1),
      priority: 0.9,
      title: `${abbr(drivers, fastest.driver_number)} sets the fastest lap`,
      detail: `${abbr(drivers, fastest.driver_number)} clocked the session's quickest lap (${fastest.lap_time_sec!.toFixed(3)}s) on lap ${fastest.lap}.`,
    })
  }

  // ── Pace drops (a lap well off a driver's own median, not pit/SC) ────────
  for (const [dn, arr] of byDriver) {
    const clean = arr.filter((l) => l.lap_time_sec && l.lap_time_sec > 0 && !isPitOrSc(l))
    if (clean.length < 6) continue
    const med = median(clean.map((l) => l.lap_time_sec!))
    let worst: LapRow | null = null
    for (const l of clean) {
      if (l.lap_time_sec! > med + 2.5 && (!worst || l.lap_time_sec! > worst.lap_time_sec!)) worst = l
    }
    if (worst) {
      const delta = worst.lap_time_sec! - med
      out.push({
        kind: 'pace_drop',
        driverNumbers: [dn],
        focalDriverNumber: dn,
        lapFrom: Math.max(1, worst.lap - 1),
        lapTo: Math.min(totalLaps, worst.lap + 1),
        priority: Math.min(0.85, 0.4 + delta / 10),
        title: `${abbr(drivers, dn)} loses time on lap ${worst.lap}`,
        detail: `${abbr(drivers, dn)} dropped ${delta.toFixed(1)}s off their pace on lap ${worst.lap} (${worst.lap_time_sec!.toFixed(3)}s vs a ${med.toFixed(3)}s median).`,
      })
    }
  }

  // ── Close battles (small gap to the car ahead, paired by position) ───────
  const byLap = new Map<number, LapRow[]>()
  for (const l of laps) {
    if (!byLap.has(l.lap)) byLap.set(l.lap, [])
    byLap.get(l.lap)!.push(l)
  }
  let bestBattle: { a: number; b: number; lap: number; gap: number } | null = null
  for (const [lap, rows] of byLap) {
    for (const l of rows) {
      const gap = l.min_gap_to_ahead_m
      if (gap == null || gap <= 0 || gap > 8 || l.position == null) continue
      const ahead = rows.find((r) => r.position === (l.position as number) - 1)
      if (!ahead) continue
      if (!bestBattle || gap < bestBattle.gap) {
        bestBattle = { a: l.driver_number, b: ahead.driver_number, lap, gap }
      }
    }
  }
  if (bestBattle) {
    out.push({
      kind: 'close_battle',
      driverNumbers: [bestBattle.b, bestBattle.a],
      focalDriverNumber: bestBattle.a,
      lapFrom: Math.max(1, bestBattle.lap - 1),
      lapTo: Math.min(totalLaps, bestBattle.lap + 1),
      priority: 0.8,
      title: `${abbr(drivers, bestBattle.a)} hunts ${abbr(drivers, bestBattle.b)}`,
      detail: `${abbr(drivers, bestBattle.a)} closed to within ${bestBattle.gap.toFixed(1)}m of ${abbr(drivers, bestBattle.b)} on lap ${bestBattle.lap}.`,
    })
  }

  // ── Tyre degradation + pit windows (from stints) ─────────────────────────
  const degSorted = [...stints]
    .filter((s) => (s.averageDegPerLap ?? 0) > 0.15 && s.totalLaps >= 5)
    .sort((a, b) => (b.averageDegPerLap ?? 0) - (a.averageDegPerLap ?? 0))
  if (degSorted[0]) {
    const s = degSorted[0]
    out.push({
      kind: 'tyre_deg',
      driverNumbers: [s.driverNumber],
      focalDriverNumber: s.driverNumber,
      lapFrom: s.startLap,
      lapTo: s.endLap,
      priority: 0.7,
      title: `${abbr(drivers, s.driverNumber)}'s ${s.compound.toLowerCase()} tyres fall away`,
      detail: `${abbr(drivers, s.driverNumber)} lost ~${(s.averageDegPerLap ?? 0).toFixed(2)}s/lap across a ${s.totalLaps}-lap ${s.compound.toLowerCase()} stint (laps ${s.startLap}–${s.endLap}).`,
    })
  }
  const pit = [...stints]
    .filter((s) => s.pitInLap != null && (s.pitDeltaSec ?? 0) > 0)
    .sort((a, b) => (a.pitDeltaSec ?? 0) - (b.pitDeltaSec ?? 0))[0]
  if (pit && pit.pitInLap != null) {
    out.push({
      kind: 'pit_window',
      driverNumbers: [pit.driverNumber],
      focalDriverNumber: pit.driverNumber,
      lapFrom: Math.max(1, pit.pitInLap - 1),
      lapTo: Math.min(totalLaps, (pit.pitOutLap ?? pit.pitInLap) + 1),
      priority: 0.6,
      title: `${abbr(drivers, pit.driverNumber)} pits on lap ${pit.pitInLap}`,
      detail: `${abbr(drivers, pit.driverNumber)} took a ${(pit.pitDeltaSec ?? 0).toFixed(1)}s stop on lap ${pit.pitInLap}.`,
    })
  }

  return out.sort((a, b) => b.priority - a.priority)
}
