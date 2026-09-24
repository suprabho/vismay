/**
 * Telemetry signal detection — pure heuristics over the ingested telemetry
 * tables (vizf1_telemetry_laps + the session's stints/drivers JSONB).
 *
 * A "signal" is a noteworthy moment (a lead change, a safety-car pit swing, a
 * car stuck behind another, the fastest lap, a pace drop, a tyre-deg cliff)
 * reduced to a lap window + the drivers involved. `buildTelemetryBrief` turns
 * the top signals into a telemetry brief the compose pipeline grounds an F1
 * story on. Ported in spirit from the f1_backend telemetry_graph detectors;
 * thresholds are session-length-relative.
 *
 * Pace heuristics only ever read CLEAN laps: never lap 1 (standing start), a
 * pit-in / pit-out lap, or a lap run under the safety car / VSC (plus the
 * restart lap after it). Treating those as "pace" is how a pit stop used to be
 * reported as a driver "losing 28s".
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

export type SignalKind =
  | 'lead_change'
  | 'neutralised_pit'
  | 'stuck_behind'
  | 'fastest_lap'
  | 'pace_drop'
  | 'close_battle'
  | 'tyre_deg'
  | 'pit_window'

/**
 * The visual that SHOWS a moment. A telemetry clip (speed, gear, pedals, dots
 * on a track fragment) shows car-vs-car action; it cannot show a pit call or a
 * position change — those are `order` moments, drawn as a zoomed position
 * chart. Pairing strategy prose with a clip is how a slide's text and graph
 * stopped matching.
 */
export type SignalVisual = 'clip' | 'order'

export interface Signal {
  kind: SignalKind
  visual: SignalVisual
  driverNumbers: number[]
  focalDriverNumber: number
  lapFrom: number
  lapTo: number
  /** 0..1 — higher is more story-worthy. */
  priority: number
  title: string
  detail: string
}

/** A contiguous run of laps under the safety car or VSC. The timing feed flags
 *  both the same way (`sc_deployed`), so the brief never claims which one. */
export interface NeutralisedWindow {
  lapFrom: number
  lapTo: number
}

/** One pit stop, merged from lap events and the session's stints. */
export interface PitStop {
  driverNumber: number
  lap: number
  /** Time lost in the pit lane, when the stint data carries it. */
  lossSec: number | null
  compoundFrom: string | null
  compoundTo: string | null
  /** True when the in-lap fell inside a safety-car / VSC window. */
  neutralised: boolean
}

/** Pre-digested lap data shared by the detectors and the brief. */
export interface RaceAnalysis {
  totalLaps: number
  byDriver: Map<number, LapRow[]>
  byLap: Map<number, LapRow[]>
  windows: NeutralisedWindow[]
  neutralisedLaps: Set<number>
  /** Laps the race was suspended after (most of the field in the pit lane at
   *  once, tyres changed for free). Those "stops" are not strategy. */
  redFlagLaps: number[]
  pitStops: PitStop[]
  /** `${driver}:${lap}` for every pit-in and pit-out lap. */
  pitLapKeys: Set<string>
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function abbr(drivers: DriverRow[], dn: number): string {
  const d = drivers.find((x) => x.driverNumber === dn)
  return d?.abbreviation || d?.fullName || `#${dn}`
}

/** Share of the running field that must flag a lap before it counts as neutralised. */
const NEUTRALISED_SHARE = 0.3
/** ~1s at racing speed — "right behind" for the stuck-behind detector. */
const STUCK_GAP_M = 70
/** The run survives a lap this far back — the per-lap minimum gap flickers. */
const STUCK_LOOSE_GAP_M = 150
const STUCK_MIN_LAPS = 4
/** Share of the field pitting on one green lap that means a red flag, not strategy. */
const RED_FLAG_SHARE = 0.5

/** Position of `dn` at the end of `lap`, walking back to the nearest known lap. */
export function positionAt(a: RaceAnalysis, dn: number, lap: number): number | null {
  const arr = a.byDriver.get(dn) ?? []
  for (let i = arr.length - 1; i >= 0; i--) {
    const l = arr[i]!
    if (l.lap <= lap && l.position != null) return l.position
  }
  return null
}

export function analyseRace(laps: LapRow[], stints: StintRow[]): RaceAnalysis {
  const byDriver = new Map<number, LapRow[]>()
  const byLap = new Map<number, LapRow[]>()
  for (const l of laps) {
    if (!byDriver.has(l.driver_number)) byDriver.set(l.driver_number, [])
    byDriver.get(l.driver_number)!.push(l)
    if (!byLap.has(l.lap)) byLap.set(l.lap, [])
    byLap.get(l.lap)!.push(l)
  }
  for (const arr of byDriver.values()) arr.sort((a, b) => a.lap - b.lap)
  const totalLaps = laps.reduce((m, l) => Math.max(m, l.lap), 0)

  // Neutralised laps: enough of the field flags sc_deployed on the same lap.
  const neutralisedLaps = new Set<number>()
  for (const [lap, rows] of byLap) {
    const flagged = rows.filter((r) => (r.events ?? []).includes('sc_deployed')).length
    if (rows.length > 0 && flagged / rows.length >= NEUTRALISED_SHARE) neutralisedLaps.add(lap)
  }
  // One unflagged lap inside a period (the feed misses the odd lap) still
  // belongs to it: bridge single-lap gaps before building the windows.
  for (const lap of [...neutralisedLaps]) {
    if (!neutralisedLaps.has(lap + 1) && neutralisedLaps.has(lap + 2)) neutralisedLaps.add(lap + 1)
  }
  const windows: NeutralisedWindow[] = []
  for (const lap of [...neutralisedLaps].sort((a, b) => a - b)) {
    const last = windows[windows.length - 1]
    if (last && lap === last.lapTo + 1) last.lapTo = lap
    else windows.push({ lapFrom: lap, lapTo: lap })
  }

  // Red flags: most of the running field flags pit_in on the same lap outside
  // a neutralisation — the race was stopped and everyone changed tyres.
  const redFlagLaps: number[] = []
  for (const [lap, rows] of byLap) {
    if (neutralisedLaps.has(lap) || rows.length === 0) continue
    const pitted = rows.filter((r) => (r.events ?? []).includes('pit_in')).length
    if (pitted / rows.length >= RED_FLAG_SHARE) redFlagLaps.push(lap)
  }
  redFlagLaps.sort((a, b) => a - b)
  const isRedFlag = (lap: number) => redFlagLaps.includes(lap)

  // Pit stops: the in-lap comes from the stints (authoritative, carries the
  // loss) with lap events as a fallback for stints the feed didn't close.
  const stops = new Map<string, PitStop>()
  const stintsByDriver = new Map<number, StintRow[]>()
  for (const s of stints) {
    if (!stintsByDriver.has(s.driverNumber)) stintsByDriver.set(s.driverNumber, [])
    stintsByDriver.get(s.driverNumber)!.push(s)
  }
  for (const arr of stintsByDriver.values()) arr.sort((a, b) => a.startLap - b.startLap)
  for (const [dn, arr] of stintsByDriver) {
    arr.forEach((s, i) => {
      if (s.pitInLap == null || isRedFlag(s.pitInLap)) return
      stops.set(`${dn}:${s.pitInLap}`, {
        driverNumber: dn,
        lap: s.pitInLap,
        lossSec: s.pitDeltaSec ?? null,
        compoundFrom: s.compound ?? null,
        compoundTo: arr[i + 1]?.compound ?? null,
        neutralised: neutralisedLaps.has(s.pitInLap),
      })
    })
  }
  for (const l of laps) {
    if (!(l.events ?? []).includes('pit_in') || l.lap >= totalLaps || isRedFlag(l.lap)) continue
    const key = `${l.driver_number}:${l.lap}`
    if (stops.has(key)) continue
    const next = (byDriver.get(l.driver_number) ?? []).find((x) => x.lap === l.lap + 1)
    // A pit_in flag with no following lap is a retirement, not a stop.
    if (!next) continue
    stops.set(key, {
      driverNumber: l.driver_number,
      lap: l.lap,
      lossSec: null,
      compoundFrom: l.compound,
      compoundTo: next.compound,
      neutralised: neutralisedLaps.has(l.lap),
    })
  }
  const pitStops = [...stops.values()].sort((a, b) => a.lap - b.lap || a.driverNumber - b.driverNumber)
  const pitLapKeys = new Set<string>()
  for (const p of pitStops) {
    pitLapKeys.add(`${p.driverNumber}:${p.lap}`)
    pitLapKeys.add(`${p.driverNumber}:${p.lap + 1}`)
  }
  // The suspended lap and the restart lap say nothing about pace either.
  for (const lap of redFlagLaps) {
    for (const r of [...(byLap.get(lap) ?? []), ...(byLap.get(lap + 1) ?? [])]) {
      pitLapKeys.add(`${r.driver_number}:${r.lap}`)
    }
  }

  return { totalLaps, byDriver, byLap, windows, neutralisedLaps, redFlagLaps, pitStops, pitLapKeys }
}

/** A lap that says something about pace: no start, pit, SC/VSC or restart lap. */
export function isCleanLap(a: RaceAnalysis, l: LapRow): boolean {
  if (!l.lap_time_sec || l.lap_time_sec <= 0 || l.lap <= 1) return false
  if (a.neutralisedLaps.has(l.lap) || a.neutralisedLaps.has(l.lap - 1)) return false
  if (a.pitLapKeys.has(`${l.driver_number}:${l.lap}`)) return false
  const ev = l.events ?? []
  return !ev.some((e) => e === 'pit_in' || e === 'sc_deployed' || e === 'incomplete')
}

const P = (n: number | null) => (n == null ? 'P?' : `P${n}`)
const clampLap = (a: RaceAnalysis, lap: number) => Math.max(1, Math.min(a.totalLaps, lap))

export function deriveSignals(
  laps: LapRow[],
  stints: StintRow[],
  drivers: DriverRow[],
  analysis: RaceAnalysis = analyseRace(laps, stints),
): Signal[] {
  const a = analysis
  const out: Signal[] = []
  const name = (dn: number) => abbr(drivers, dn)

  // ── Safety car / VSC pit swings ──────────────────────────────────────────
  // Who boxed under the neutralisation and who didn't, and what it did to the
  // order: the position before the window vs two laps after it (once every
  // stop has cycled through).
  for (const w of a.windows) {
    const before = w.lapFrom - 1
    const after = clampLap(a, w.lapTo + 2)
    const stoppers = a.pitStops.filter((p) => p.lap >= w.lapFrom && p.lap <= w.lapTo)
    const pitted = new Set(stoppers.map((p) => p.driverNumber))
    // Front runners (top 6 before the window) — the ones a swing matters for.
    const front = [...a.byDriver.keys()]
      .map((dn) => ({ dn, pos: positionAt(a, dn, before) }))
      .filter((x): x is { dn: number; pos: number } => x.pos != null && x.pos <= 6)
      .sort((x, y) => x.pos - y.pos)
    if (front.length === 0) continue
    const moves = front.map((x) => ({ ...x, posAfter: positionAt(a, x.dn, after), pitted: pitted.has(x.dn) }))
    const swing = (m: (typeof moves)[number]) => (m.posAfter == null ? 0 : m.pos - m.posAfter)
    const winner = [...moves].sort((x, y) => swing(y) - swing(x))[0]!
    const loser = [...moves].sort((x, y) => swing(x) - swing(y))[0]!
    const maxSwing = Math.max(Math.abs(swing(winner)), Math.abs(swing(loser)))
    const leaderChanged = moves.find((m) => m.pos === 1)?.posAfter !== 1
    const label = w.lapFrom === w.lapTo ? `lap ${w.lapFrom}` : `laps ${w.lapFrom}–${w.lapTo}`
    const describe = (m: (typeof moves)[number]) => {
      const stop = stoppers.find((p) => p.driverNumber === m.dn)
      const how = stop ? `pitted on lap ${stop.lap}` : 'stayed out'
      return `${name(m.dn)} (${P(m.pos)}) ${how} → ${P(m.posAfter)} by lap ${after}`
    }
    const pair = winner.dn === loser.dn ? [winner.dn] : [winner.dn, loser.dn]
    out.push({
      kind: 'neutralised_pit',
      visual: 'order',
      driverNumbers: pair,
      focalDriverNumber: leaderChanged ? winner.dn : loser.dn,
      lapFrom: clampLap(a, w.lapFrom - 1),
      lapTo: clampLap(a, w.lapTo + 1),
      priority: leaderChanged ? 0.97 : maxSwing >= 2 ? 0.9 : 0.6,
      title:
        stoppers.length === 0
          ? `Neutralisation on ${label}: nobody at the front stops`
          : `The pit call under the neutralisation on ${label}`,
      detail:
        `Race neutralised on ${label}. ` +
        moves.map(describe).join('; ') +
        '.',
    })
  }

  // ── Lead changes (not lap 1, not a pit-cycle shuffle inside a window) ────
  const leaderAt = (lap: number) => (a.byLap.get(lap) ?? []).find((r) => r.position === 1)?.driver_number
  const leadChanges: Signal[] = []
  for (let lap = 2; lap <= a.totalLaps; lap++) {
    const prev = leaderAt(lap - 1)
    const cur = leaderAt(lap)
    if (prev == null || cur == null || prev === cur) continue
    if (a.neutralisedLaps.has(lap)) continue // the SC/VSC signal already tells it
    const viaPit = a.pitLapKeys.has(`${prev}:${lap}`) || a.pitLapKeys.has(`${prev}:${lap - 1}`)
    leadChanges.push({
      kind: 'lead_change',
      visual: viaPit ? 'order' : 'clip',
      driverNumbers: [cur, prev],
      focalDriverNumber: cur,
      lapFrom: clampLap(a, lap - 1),
      lapTo: clampLap(a, lap + 1),
      priority: viaPit ? 0.7 : 0.88,
      title: `${name(cur)} takes the lead from ${name(prev)} on lap ${lap}`,
      detail:
        `${name(cur)} led at the end of lap ${lap}, taking over from ${name(prev)}` +
        (viaPit ? ` while ${name(prev)} pitted.` : ' on track.'),
    })
  }
  // A long race can trade the lead through every pit cycle — keep the best few.
  out.push(...leadChanges.sort((x, y) => y.priority - x.priority).slice(0, 3))

  // ── Stuck behind: the same car directly ahead, within ~1s, lap after lap ─
  // The per-lap minimum gap flickers, so a run survives a lap up to ~2s back as
  // long as most of it is tight. Only a story when the car behind was quicker.
  type Train = { dn: number; ahead: number; from: number; to: number; faster: number }
  const trains: Train[] = []
  for (const [dn, arr] of a.byDriver) {
    let run: { ahead: number; from: number; to: number; tight: number } | null = null
    const close = () => {
      const r = run
      run = null
      if (!r) return
      const len = r.to - r.from + 1
      if (len < STUCK_MIN_LAPS || r.tight < Math.max(3, Math.ceil(len * 0.6))) return
      const inRun = (l: LapRow) => l.lap >= r.from && l.lap <= r.to && isCleanLap(a, l)
      const mine = arr.filter(inRun).map((l) => l.lap_time_sec!)
      const theirs = (a.byDriver.get(r.ahead) ?? []).filter(inRun).map((l) => l.lap_time_sec!)
      if (mine.length < 3 || theirs.length < 3) return
      trains.push({ dn, ahead: r.ahead, from: r.from, to: r.to, faster: median(theirs) - median(mine) })
    }
    for (const l of arr) {
      const aheadRow =
        l.position != null && l.position > 1
          ? (a.byLap.get(l.lap) ?? []).find((r) => r.position === (l.position as number) - 1)
          : undefined
      const gap = l.min_gap_to_ahead_m
      const near =
        aheadRow != null && gap != null && gap > 0 && gap <= STUCK_LOOSE_GAP_M && !a.neutralisedLaps.has(l.lap)
      const tight = near && gap! <= STUCK_GAP_M ? 1 : 0
      if (near && run && run.ahead === aheadRow!.driver_number && l.lap === run.to + 1) {
        run.to = l.lap
        run.tight += tight
      } else {
        close()
        // A run starts on a tight lap, never a loose one.
        if (near && tight) run = { ahead: aheadRow!.driver_number, from: l.lap, to: l.lap, tight }
      }
    }
    close()
  }
  const quicker = trains
    .filter((t) => t.faster > 0.1)
    .sort((x, y) => y.to - y.from - (x.to - x.from) || y.faster - x.faster)
    .slice(0, 8) // the brief ranks for focus and caps each kind in its clips
  for (const t of quicker) {
    const len = t.to - t.from + 1
    // The clip plays the END of the run — the closest, most frustrated laps.
    const clipTo = t.to
    out.push({
      kind: 'stuck_behind',
      visual: 'clip',
      driverNumbers: [t.ahead, t.dn],
      focalDriverNumber: t.dn,
      lapFrom: Math.max(t.from, clipTo - 3),
      lapTo: clipTo,
      priority: Math.min(0.88, 0.7 + len / 100 + t.faster / 5),
      title: `${name(t.dn)} stuck behind ${name(t.ahead)} for ${len} laps`,
      detail:
        `${name(t.dn)} ran directly behind ${name(t.ahead)} from lap ${t.from} to lap ${t.to} (${len} laps, ` +
        `mostly within ~1s) — on clean laps ${name(t.dn)} was ${t.faster.toFixed(2)}s/lap quicker (median).`,
    })
  }

  // ── Fastest lap of the session (clean laps only) ─────────────────────────
  let fastest: LapRow | null = null
  for (const l of a.byDriver.values()) {
    for (const x of l) {
      if (!isCleanLap(a, x)) continue
      if (!fastest || x.lap_time_sec! < fastest.lap_time_sec!) fastest = x
    }
  }
  if (fastest) {
    out.push({
      kind: 'fastest_lap',
      visual: 'clip',
      driverNumbers: [fastest.driver_number],
      focalDriverNumber: fastest.driver_number,
      lapFrom: clampLap(a, fastest.lap - 1),
      lapTo: clampLap(a, fastest.lap + 1),
      priority: 0.55,
      title: `${name(fastest.driver_number)} sets the fastest lap`,
      detail: `${name(fastest.driver_number)} clocked the session's quickest lap (${fastest.lap_time_sec!.toFixed(3)}s) on lap ${fastest.lap}.`,
    })
  }

  // ── Pace drops (a clean lap well off the driver's own median) ────────────
  const drops: Signal[] = []
  for (const [dn, arr] of a.byDriver) {
    const clean = arr.filter((l) => isCleanLap(a, l))
    if (clean.length < 6) continue
    const med = median(clean.map((l) => l.lap_time_sec!))
    let worst: LapRow | null = null
    for (const l of clean) {
      if (l.lap_time_sec! > med + 2.5 && (!worst || l.lap_time_sec! > worst.lap_time_sec!)) worst = l
    }
    if (!worst) continue
    const delta = worst.lap_time_sec! - med
    drops.push({
      kind: 'pace_drop',
      visual: 'clip',
      driverNumbers: [dn],
      focalDriverNumber: dn,
      lapFrom: clampLap(a, worst.lap - 1),
      lapTo: clampLap(a, worst.lap + 1),
      priority: Math.min(0.65, 0.35 + delta / 20),
      title: `${name(dn)} loses time on lap ${worst.lap}`,
      detail: `${name(dn)} was ${delta.toFixed(1)}s off their clean-lap median on lap ${worst.lap} (${worst.lap_time_sec!.toFixed(3)}s vs ${med.toFixed(3)}s) — not a pit, start or safety-car lap.`,
    })
  }
  out.push(...drops.sort((x, y) => y.priority - x.priority).slice(0, 2))

  // ── Closest racing moment (small gap to the car ahead, paired by position) ─
  let bestBattle: { a: number; b: number; lap: number; gap: number } | null = null
  for (const [lap, rows] of a.byLap) {
    if (lap <= 1 || a.neutralisedLaps.has(lap)) continue
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
      visual: 'clip',
      driverNumbers: [bestBattle.b, bestBattle.a],
      focalDriverNumber: bestBattle.a,
      lapFrom: clampLap(a, bestBattle.lap - 1),
      lapTo: clampLap(a, bestBattle.lap + 1),
      priority: 0.6,
      title: `${name(bestBattle.a)} hunts ${name(bestBattle.b)}`,
      detail: `${name(bestBattle.a)} closed to within ${bestBattle.gap.toFixed(1)}m of ${name(bestBattle.b)} on lap ${bestBattle.lap}.`,
    })
  }

  // ── Tyre degradation (a full, plausible stint — not one cut short) ───────
  const degSorted = stints
    .filter((s) => (s.averageDegPerLap ?? 0) > 0.15 && (s.averageDegPerLap ?? 0) < 1.5 && s.totalLaps >= 8)
    .sort((x, y) => (y.averageDegPerLap ?? 0) - (x.averageDegPerLap ?? 0))
  if (degSorted[0]) {
    const s = degSorted[0]
    out.push({
      kind: 'tyre_deg',
      visual: 'clip',
      driverNumbers: [s.driverNumber],
      focalDriverNumber: s.driverNumber,
      lapFrom: s.startLap,
      lapTo: Math.min(s.endLap, s.startLap + 3),
      priority: 0.5,
      title: `${name(s.driverNumber)}'s ${s.compound.toLowerCase()} tyres fall away`,
      detail: `${name(s.driverNumber)} lost ~${(s.averageDegPerLap ?? 0).toFixed(2)}s/lap across a ${s.totalLaps}-lap ${s.compound.toLowerCase()} stint (laps ${s.startLap}–${s.endLap}).`,
    })
  }

  // ── Slowest stop (a botched stop is the pit story) ───────────────────────
  // Compared against every stop in the race; a stop under the SC/VSC still
  // counts — a slow change there is exactly how a free stop gets wasted.
  const timed = a.pitStops.filter((p) => p.lossSec != null)
  const typical = median(timed.map((p) => p.lossSec!))
  const slowStops = timed
    .filter((p) => typical > 0 && p.lossSec! > typical + 3)
    .sort((x, y) => (y.lossSec ?? 0) - (x.lossSec ?? 0))
    .slice(0, 3)
  for (const slow of slowStops) {
    out.push({
      kind: 'pit_window',
      visual: 'order',
      driverNumbers: [slow.driverNumber],
      focalDriverNumber: slow.driverNumber,
      lapFrom: clampLap(a, slow.lap - 1),
      lapTo: clampLap(a, slow.lap + 1),
      priority: 0.62,
      title: `${name(slow.driverNumber)}'s slow stop on lap ${slow.lap}`,
      detail:
        `${name(slow.driverNumber)}'s lap-${slow.lap} stop cost ${slow.lossSec!.toFixed(1)}s in the pit lane, ` +
        `against a typical ${typical.toFixed(1)}s` +
        (slow.neutralised ? ' — under the safety car / VSC.' : '.'),
    })
  }

  return out.sort((x, y) => y.priority - x.priority)
}
