/**
 * Builds a race recap (./types) from a session's stored telemetry. Pure: the
 * rows come in, the recap comes out, so it runs the same in the API route
 * (./loadRecap.server) and in tests against a captured race.
 *
 * Chapters, in race order:
 *   - start      — always: places gained and lost on lap 1.
 *   - pit-swing  — when two cars swapped places through their stops (an
 *                  undercut or an overcut), the one nearest the front.
 *   - battle     — when there was an on-track pass, the best one (for the
 *                  lead, else nearest the front and closest beforehand), with
 *                  both cars' speed traces through the corner where it happened.
 *   - finish     — always: the top five, gaps, points and the fastest lap.
 *
 * Every number in the copy comes from the rows; the copy is templated, never
 * generated, so it can't claim what the data doesn't show.
 */

import type {
  BattleChapter,
  BattleTelemetry,
  FinishChapter,
  PitSwingChapter,
  RaceRecap,
  RecapChapter,
  RecapDriver,
  StartChapter,
  TraceSample,
} from './types'

// ── Input rows (the vizf1_telemetry_* tables, as the ingest writes them) ────

export interface DriverJson {
  driverNumber: number
  abbreviation: string
  lastName?: string | null
  teamName?: string | null
  teamColour?: string | null
}

export interface ResultJson {
  driverNumber: number
  abbreviation?: string | null
  gridPosition?: number | null
  position?: number | null
  /** FastF1: the position as a string, or R (retired), D (disqualified), E, W, F, N. */
  classifiedPosition?: string | null
  points?: number | null
  status?: string | null
  dnf?: boolean | null
  /** FastF1 `Time`: the winner's race time; everyone else's gap to the winner. */
  timeSec?: number | null
  laps?: number | null
}

export interface RecapSessionRow {
  session_key: string
  season: number | null
  round: number | null
  gp_name: string | null
  drivers: DriverJson[] | null
  session_results: ResultJson[] | null
}

export interface RecapLapRow {
  driver_number: number
  lap: number
  lap_time_sec: number | null
  /** Position at the end of the lap. */
  position: number | null
  events: string[] | null
}

/** One lap of `vizf1_lap_telemetry.channels`. */
export interface LapChannels {
  /** Seconds, the session clock the car positions also use (×1000). */
  sessionTime: number[]
  /** Metres from the start of the lap. */
  distance: number[]
  speed: number[]
  throttle: number[]
  /** FastF1: on/off (0/1 or booleans); OpenF1: 0–100. */
  brake: Array<number | boolean>
  /** FastF1 DRS code: 10, 12 and 14 mean the flap is open. */
  drs: number[]
  nGear: number[]
}

export interface CornerRow {
  number: number
  letter?: string | null
  /** Metres from the start of the lap. */
  distance: number
}

export interface RecapPitStop {
  driverNumber: number
  lap: number
  laneSec: number | null
  stopSec: number | null
}

export interface RecapPeriod {
  kind: 'RED' | 'SC' | 'VSC' | 'YELLOW'
  startLap: number
  endLap: number
}

export interface RecapInputs {
  session: RecapSessionRow
  laps: RecapLapRow[]
  /** Pit stops and flag periods (loadRaceEvents); null when unavailable. */
  events: { pitStops: RecapPitStop[]; periods: RecapPeriod[] } | null
  corners: CornerRow[]
}

/** The pass the battle chapter is about; the loader fetches its lap's channels. */
export interface PassPick {
  lap: number
  /** Driver numbers: a passed b. */
  a: number
  b: number
  /** a's gap to b at the end of the lap before, seconds. */
  gapBefore: number | null
  position: number
}

// ── The race, indexed ───────────────────────────────────────────────────────

const OPEN_DRS = new Set([10, 12, 14])

interface Race {
  drivers: Map<number, RecapDriver>
  laps: Map<number, Map<number, RecapLapRow>>
  totalLaps: number
  results: ResultJson[]
  pos: (dn: number, lap: number) => number | null
  /** Race time to the end of a lap (s); null laps borrow the field's median. */
  cum: (dn: number, lap: number) => number | null
  pitLaps: (dn: number) => number[]
  neutralised: (lap: number) => boolean
  code: (dn: number) => string
  name: (dn: number) => string
}

function indexRace(inputs: RecapInputs): Race {
  const drivers = new Map<number, RecapDriver>()
  for (const d of inputs.session.drivers ?? []) {
    const hex = (d.teamColour ?? '').replace(/^#/, '')
    drivers.set(d.driverNumber, {
      number: d.driverNumber,
      code: d.abbreviation,
      name: d.lastName || d.abbreviation,
      team: d.teamName ?? '',
      color: /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : '#8e8e99',
    })
  }

  const laps = new Map<number, Map<number, RecapLapRow>>()
  let totalLaps = 0
  for (const r of inputs.laps) {
    let m = laps.get(r.driver_number)
    if (!m) laps.set(r.driver_number, (m = new Map()))
    m.set(r.lap, r)
    totalLaps = Math.max(totalLaps, r.lap)
  }
  const results = [...(inputs.session.session_results ?? [])].sort(
    (x, y) => (x.position ?? 99) - (y.position ?? 99),
  )
  const winnerLaps = results[0]?.laps
  if (winnerLaps) totalLaps = winnerLaps

  // Median lap time per lap, to stand in for a missing one.
  const median = new Map<number, number>()
  for (let lap = 1; lap <= totalLaps; lap++) {
    const ts: number[] = []
    for (const m of laps.values()) {
      const t = m.get(lap)?.lap_time_sec
      if (t != null && Number.isFinite(t)) ts.push(t)
    }
    ts.sort((x, y) => x - y)
    if (ts.length) median.set(lap, ts[Math.floor(ts.length / 2)])
  }
  const cumCache = new Map<number, (number | null)[]>()
  const cum = (dn: number, lap: number) => {
    let arr = cumCache.get(dn)
    if (!arr) {
      arr = [0]
      const m = laps.get(dn)
      let acc: number | null = 0
      for (let l = 1; l <= totalLaps; l++) {
        const row = m?.get(l)
        const t = row ? (row.lap_time_sec ?? median.get(l) ?? null) : null
        acc = acc != null && t != null ? acc + t : null
        arr.push(acc)
      }
      cumCache.set(dn, arr)
    }
    return arr[lap] ?? null
  }

  const neutral = new Set<number>()
  for (const p of inputs.events?.periods ?? []) {
    if (p.kind === 'YELLOW') continue
    for (let l = p.startLap; l <= p.endLap; l++) neutral.add(l)
  }
  for (const m of laps.values()) for (const r of m.values()) if (r.events?.includes('sc_deployed')) neutral.add(r.lap)

  return {
    drivers,
    laps,
    totalLaps,
    results,
    pos: (dn, lap) => laps.get(dn)?.get(lap)?.position ?? null,
    cum,
    pitLaps: (dn) =>
      [...(laps.get(dn)?.values() ?? [])]
        .filter((r) => r.events?.includes('pit_in'))
        .map((r) => r.lap)
        .sort((x, y) => x - y),
    neutralised: (lap) => neutral.has(lap),
    code: (dn) => drivers.get(dn)?.code ?? String(dn),
    name: (dn) => drivers.get(dn)?.name ?? String(dn),
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

const places = (n: number) => (n === 1 ? 'a place' : `${n} places`)
const secs = (s: number, dp = 1) => `${s.toFixed(dp)}s`
const signed = (s: number, dp = 1) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(dp)}s`

export function formatLapTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

// ── 01 Lights out ───────────────────────────────────────────────────────────

function startChapter(race: Race): StartChapter {
  const starters = race.results.filter((r) => r.gridPosition != null)
  const field = starters.length || race.drivers.size
  const moves: { dn: number; from: number; to: number; delta: number }[] = []
  for (const r of starters) {
    const to = race.pos(r.driverNumber, 1)
    if (to == null) continue
    // Grid 0 is a pit-lane start: behind everyone.
    const from = r.gridPosition && r.gridPosition > 0 ? r.gridPosition : field
    moves.push({ dn: r.driverNumber, from, to, delta: from - to })
  }
  moves.sort((x, y) => y.delta - x.delta || x.to - y.to)

  const gainers = moves.filter((m) => m.delta > 0)
  const losers = moves.filter((m) => m.delta < 0).sort((x, y) => x.delta - y.delta)
  const shown = [...gainers.slice(0, 3), ...losers.slice(0, 2)]
  for (const m of [...moves].sort((x, y) => x.to - y.to)) {
    if (shown.length >= 5) break
    if (!shown.includes(m)) shown.push(m)
  }
  shown.sort((x, y) => y.delta - x.delta || x.to - y.to)

  const hero = gainers[0] ?? null
  const pole = moves.find((m) => m.from === 1)
  const leader = moves.find((m) => m.to === 1)
  const heroText = hero
    ? `${race.name(hero.dn)} went from P${hero.from} to P${hero.to} on the opening lap.`
    : 'Nobody gained a place on the opening lap.'
  const leadText =
    pole && leader
      ? pole.dn === leader.dn
        ? ` ${race.name(pole.dn)} kept the lead from pole.`
        : ` ${race.name(leader.dn)} took the lead from polesitter ${race.name(pole.dn)}.`
      : ''

  const focusOn = hero ?? leader ?? moves[0] ?? null
  let headline: string
  if (hero && hero.delta >= 2) headline = `${race.name(hero.dn)} gains ${places(hero.delta)} on lap 1`
  else if (leader && pole?.dn === leader.dn) headline = `${race.name(leader.dn)} leads away from pole`
  else if (leader) headline = `${race.name(leader.dn)} leads after lap 1`
  else headline = 'The opening lap'

  return {
    kind: 'start',
    label: 'Lights out',
    kicker: 'Lights out · Lap 1',
    headline,
    dek: heroText + leadText,
    replay: { lap: 1, cam: 'heli', focus: focusOn ? race.code(focusOn.dn) : null },
    hero: hero ? { code: race.code(hero.dn), delta: hero.delta, from: hero.from, to: hero.to } : null,
    deltas: shown.map((m) => ({ code: race.code(m.dn), delta: m.delta })),
  }
}

// ── The undercut / overcut ──────────────────────────────────────────────────

function pitSwingChapter(race: Race, inputs: RecapInputs): PitSwingChapter | null {
  type Cand = { a: number; b: number; sa: number; sb: number; before: number; after: number; gb: number; ga: number; score: number }
  let best: Cand | null = null
  const dns = [...race.laps.keys()]
  for (const a of dns) {
    for (const sa of race.pitLaps(a)) {
      if (race.neutralised(sa)) continue
      for (const b of dns) {
        if (b === a) continue
        for (const sb of race.pitLaps(b)) {
          if (sb === sa || Math.abs(sb - sa) > 4 || race.neutralised(sb)) continue
          const before = Math.min(sa, sb) - 1
          const after = Math.max(sa, sb) + 1
          if (before < 1) continue
          // No other stop by either car inside the window.
          const others = [...race.pitLaps(a), ...race.pitLaps(b)].filter((l) => l >= before && l <= after)
          if (others.length !== 2) continue
          const pa0 = race.pos(a, before), pb0 = race.pos(b, before)
          const pa1 = race.pos(a, after), pb1 = race.pos(b, after)
          if (pa0 == null || pb0 == null || pa1 == null || pb1 == null) continue
          // b directly ahead before the stops, a ahead of b after them.
          if (pa0 !== pb0 + 1 || pa1 > pb1) continue
          const ca0 = race.cum(a, before), cb0 = race.cum(b, before)
          const ca1 = race.cum(a, after), cb1 = race.cum(b, after)
          if (ca0 == null || cb0 == null || ca1 == null || cb1 == null) continue
          const gb = ca0 - cb0
          const ga = ca1 - cb1
          if (gb <= 0 || gb > 5 || ga >= 0) continue
          const score = 40 - Math.min(pa1, pb1) * 3 + Math.min(gb - ga, 8)
          if (!best || score > best.score) best = { a, b, sa, sb, before, after, gb, ga, score }
        }
      }
    }
  }
  if (!best) return null
  const { a, b, sa, sb, before, after, gb, ga } = best

  const from = Math.max(1, before - 4)
  const to = Math.min(race.totalLaps, after + 5)
  const gap: { lap: number; gap: number }[] = []
  for (let l = from; l <= to; l++) {
    const x = race.cum(a, l), y = race.cum(b, l)
    if (x != null && y != null) gap.push({ lap: l, gap: Math.round((x - y) * 100) / 100 })
  }

  const stop = (dn: number, lap: number) =>
    inputs.events?.pitStops.find((p) => p.driverNumber === dn && Math.abs(p.lap - lap) <= 1) ?? null
  const stopTile = (dn: number, lap: number) => {
    const p = stop(dn, lap)
    const sec = p?.stopSec ?? p?.laneSec ?? null
    if (sec == null) return null
    return { value: secs(sec), label: `${race.code(dn)} ${p?.stopSec != null ? 'stop' : 'pit lane'} · L${lap}` }
  }
  const swing = gb - ga
  const tiles: PitSwingChapter['tiles'] = [stopTile(a, sa), stopTile(b, sb)].filter((t) => t != null)
  tiles.push({ value: secs(swing), label: 'Net swing', highlight: true })

  const undercut = sa < sb
  const word = undercut ? 'undercut' : 'overcut'
  const posAfter = race.pos(a, after)!
  const A = race.name(a), B = race.name(b)
  const first = undercut ? A : B
  const firstLap = Math.min(sa, sb), secondLap = Math.max(sa, sb)
  const n = secondLap - firstLap
  return {
    kind: 'pit-swing',
    label: undercut ? 'The undercut' : 'The overcut',
    kicker: `The ${word} · Laps ${before}–${after}`,
    headline: `${A} ${word}s ${B} for P${posAfter}`,
    dek:
      `${first} pitted on lap ${firstLap}, ${n === 1 ? 'a lap' : `${n} laps`} before ${undercut ? B : A} stopped on lap ${secondLap}. ` +
      `${A} was ${secs(gb)} behind ${B} on lap ${before} and ${secs(-ga)} ahead on lap ${after}: a ${secs(swing)} swing.`,
    replay: { lap: secondLap + 1, cam: 'tv', focus: race.code(a) },
    a: race.code(a),
    b: race.code(b),
    gap,
    pits: [
      { code: race.code(a), lap: sa },
      { code: race.code(b), lap: sb },
    ],
    tiles,
  }
}

// ── Wheel to wheel ──────────────────────────────────────────────────────────

/** The on-track pass worth a chapter: for the lead if any, else near the front and close beforehand. */
export function pickPass(inputs: RecapInputs): PassPick | null {
  const race = indexRace(inputs)
  let best: (PassPick & { score: number }) | null = null
  const dns = [...race.laps.keys()]
  const pitNear = (dn: number, lap: number) => race.pitLaps(dn).some((l) => l >= lap - 1 && l <= lap)
  for (let lap = 2; lap <= race.totalLaps; lap++) {
    if (race.neutralised(lap) || race.neutralised(lap - 1)) continue
    for (const a of dns) {
      const pa0 = race.pos(a, lap - 1), pa1 = race.pos(a, lap)
      if (pa0 == null || pa1 == null || pa1 >= pa0) continue
      for (const b of dns) {
        if (b === a) continue
        const pb0 = race.pos(b, lap - 1), pb1 = race.pos(b, lap)
        // b directly ahead at the end of the lap before, behind at the end of this one.
        if (pb0 == null || pb1 == null || pb0 !== pa0 - 1 || pb1 < pa1) continue
        if (pitNear(a, lap) || pitNear(b, lap)) continue
        // Not a car about to retire.
        if (!race.laps.get(b)?.has(lap + 1) && lap < race.totalLaps) continue
        const ca = race.cum(a, lap - 1), cb = race.cum(b, lap - 1)
        const gapBefore = ca != null && cb != null ? ca - cb : null
        const score =
          50 - pa1 * 4 + (pa1 === 1 ? 15 : 0) + (gapBefore != null ? Math.max(0, 8 - gapBefore * 4) : 0) + lap / race.totalLaps
        if (!best || score > best.score) best = { lap, a, b, gapBefore, position: pa1, score }
      }
    }
  }
  if (!best) return null
  const { score: _score, ...pick } = best
  return pick
}

/** Interpolate y at x over ascending xs. */
function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  const n = xs.length - 1
  if (x >= xs[n]) return ys[n]
  let lo = 0, hi = n
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }
  const u = (x - xs[lo]) / (xs[hi] - xs[lo] || 1)
  return ys[lo] + (ys[hi] - ys[lo]) * u
}

/** Samples with strictly increasing distance (the feed repeats or dips at times). */
function monotone(ch: LapChannels) {
  const idx: number[] = []
  let last = -Infinity
  for (let i = 0; i < ch.distance.length; i++) {
    const d = ch.distance[i]
    if (Number.isFinite(d) && d > last && Number.isFinite(ch.sessionTime[i])) {
      idx.push(i)
      last = d
    }
  }
  const pick = <T,>(arr: T[]) => idx.map((i) => arr[i])
  return {
    d: pick(ch.distance),
    t: pick(ch.sessionTime),
    v: pick(ch.speed),
    thr: pick(ch.throttle),
    brk: pick(ch.brake).map((x) => (typeof x === 'boolean' ? (x ? 100 : 0) : x <= 1 ? x * 100 : x)),
    drs: pick(ch.drs),
    gear: pick(ch.nGear),
  }
}

function cornerLabel(c: CornerRow) {
  return `Turn ${c.number}${c.letter ?? ''}`
}

function nearestCorner(corners: CornerRow[], d: number, within: number): CornerRow | null {
  let best: CornerRow | null = null
  for (const c of corners) {
    if (Math.abs(c.distance - d) <= within && (!best || Math.abs(c.distance - d) < Math.abs(best.distance - d))) best = c
  }
  return best
}

function battleChapter(
  race: Race,
  inputs: RecapInputs,
  pass: PassPick,
  channels: { a: LapChannels | null; b: LapChannels | null } | null,
): BattleChapter {
  const { lap, a, b } = pass
  const A = race.name(a), B = race.name(b)
  const forWhat = pass.position === 1 ? 'the lead' : `P${pass.position}`

  let trace: BattleChapter['trace'] = null
  let tiles: BattleTelemetry[] = []
  let corner: CornerRow | null = null
  let atMs: number | undefined

  const ca = channels?.a ? monotone(channels.a) : null
  const cb = channels?.b ? monotone(channels.b) : null
  if (ca && cb && ca.d.length > 10 && cb.d.length > 10) {
    const d0 = Math.max(ca.d[0], cb.d[0])
    const d1 = Math.min(ca.d[ca.d.length - 1], cb.d[cb.d.length - 1])
    // Δ(d): how much later a reaches distance d than b. The pass is the last
    // place it goes from positive (a behind) to ≤ 0 (a ahead).
    let passAt: number | null = null
    let prev: { d: number; dt: number } | null = null
    for (let d = d0; d <= d1; d += 5) {
      const dt = interp(ca.d, ca.t, d) - interp(cb.d, cb.t, d)
      if (prev && prev.dt > 0 && dt <= 0) passAt = prev.d + ((d - prev.d) * prev.dt) / (prev.dt - dt)
      prev = { d, dt }
    }
    if (passAt != null) {
      const w0 = Math.max(d0, passAt - 450)
      const w1 = Math.min(d1, passAt + 250)
      const series = (c: typeof ca): TraceSample[] => {
        const out: TraceSample[] = []
        const step = Math.max(1, Math.ceil(c.d.filter((d) => d >= w0 && d <= w1).length / 140))
        let k = 0
        for (let i = 0; i < c.d.length; i++) {
          if (c.d[i] < w0 || c.d[i] > w1) continue
          if (k++ % step === 0) out.push({ d: Math.round(c.d[i]), v: Math.round(c.v[i]) })
        }
        return out
      }
      const ta = series(ca)
      const slowest = ta.reduce<TraceSample | null>((m, s) => (!m || s.v < m.v ? s : m), null)
      const apexCorner = slowest ? nearestCorner(inputs.corners, slowest.d, 150) : null
      corner = nearestCorner(inputs.corners, passAt, 300)
      trace = {
        a: ta,
        b: series(cb),
        passAt: Math.round(passAt),
        apex: slowest ? { d: slowest.d, label: apexCorner ? `${cornerLabel(apexCorner)} apex` : 'Slowest point' } : null,
        caption: `KM/H · METRES INTO LAP ${lap} →`,
      }
      const at = (c: typeof ca) => {
        let i = 0
        while (i < c.d.length - 1 && c.d[i + 1] <= passAt!) i++
        return i
      }
      const ia = at(ca), ib = at(cb)
      const gapEnd = interp(cb.d, cb.t, w1) - interp(ca.d, ca.t, w1)
      tiles = [
        { code: race.code(a), speed: Math.round(interp(ca.d, ca.v, passAt)), gear: ca.gear[ia], throttle: Math.round(ca.thr[ia]), brake: Math.round(ca.brk[ia]), drs: OPEN_DRS.has(ca.drs[ia]) },
        { code: race.code(b), speed: Math.round(interp(cb.d, cb.v, passAt)), gear: cb.gear[ib], throttle: Math.round(cb.thr[ib]), brake: Math.round(cb.brk[ib]), drs: OPEN_DRS.has(cb.drs[ib]), delta: signed(gapEnd, 2) },
      ]
      atMs = Math.round((interp(ca.d, ca.t, passAt) - 7) * 1000)
    }
  }

  const where = corner ? ` into ${cornerLabel(corner)}` : ''
  const drs = tiles[0]?.drs ? ' with DRS open' : ''
  const before =
    pass.gapBefore != null
      ? `${A} was ${secs(pass.gapBefore)} behind ${B} at the end of lap ${lap - 1}. `
      : ''
  return {
    kind: 'battle',
    label: pass.position === 1 ? 'For the lead' : 'Wheel to wheel',
    kicker: `${pass.position === 1 ? 'For the lead' : 'Wheel to wheel'} · Lap ${lap}`,
    headline: `${A} passes ${B} for ${forWhat}${where}`,
    dek:
      before +
      `The order flipped${where ? ` at ${cornerLabel(corner!)}` : ''} on lap ${lap}${drs}` +
      (trace ? '; the traces show both cars through the move.' : '.'),
    replay: { lap, atMs, cam: 'chase', focus: race.code(a) },
    a: race.code(a),
    b: race.code(b),
    lap,
    trace,
    tiles,
  }
}

// ── Chequered flag ──────────────────────────────────────────────────────────

function finishChapter(race: Race): FinishChapter | null {
  const classified = race.results.filter((r) => r.position != null)
  if (!classified.length) return null
  const winnerLaps = classified[0].laps ?? race.totalLaps
  // FastF1 says "Lapped" for lapped finishers and some retirements alike, so
  // go by the laps completed.
  const lapsDown = (r: ResultJson) => (r.laps != null ? winnerLaps - r.laps : 0)
  const finished = (r: ResultJson) => lapsDown(r) === 0 && r.timeSec != null
  const gapOf = (r: ResultJson): string => {
    if (r.position === 1) return 'Winner'
    const cls = r.classifiedPosition
    if (cls && !/^\d+$/.test(cls)) return cls === 'D' ? 'DSQ' : 'DNF'
    if (finished(r)) return `+${r.timeSec!.toFixed(3)}s`
    const n = lapsDown(r)
    if (n > 0 && /lap|finished|\+/i.test(r.status ?? '')) return `+${n} lap${n > 1 ? 's' : ''}`
    return r.status && !/lap/i.test(r.status) ? r.status : 'DNF'
  }
  const results = classified.slice(0, 5).map((r) => ({
    pos: r.position!,
    code: race.code(r.driverNumber),
    gap: gapOf(r),
    pts: r.points ?? 0,
  }))

  let fastest: { dn: number; lap: number; t: number } | null = null
  for (const [dn, m] of race.laps) {
    const pits = new Set(race.pitLaps(dn))
    for (const r of m.values()) {
      if (r.lap_time_sec == null || r.lap === 1 || pits.has(r.lap) || pits.has(r.lap - 1)) continue
      if (!fastest || r.lap_time_sec < fastest.t) fastest = { dn, lap: r.lap, t: r.lap_time_sec }
    }
  }

  const [w, p2, p3] = classified
  const W = race.name(w.driverNumber)
  const margin = p2 && finished(p2) ? p2.timeSec! : null
  const grid = w.gridPosition ?? null
  let headline: string
  if (grid != null && grid >= 4) headline = `${W} wins from P${grid}`
  else if (margin != null && margin < 2) headline = `${W} holds on by ${margin.toFixed(1)} seconds`
  else if (margin != null) headline = `${W} wins by ${margin.toFixed(1)} seconds`
  else headline = `${W} wins`
  const team = race.drivers.get(w.driverNumber)?.team
  let dek = `${W}${team ? ` (${team})` : ''} took the flag`
  dek += p2 ? (margin != null ? ` ${secs(margin, 3)} ahead of ${race.name(p2.driverNumber)}` : ` ahead of ${race.name(p2.driverNumber)}`) : ''
  dek += p3 ? `, with ${race.name(p3.driverNumber)} third.` : '.'
  if (grid != null && grid > 0) dek += ` ${W} started P${grid}.`

  return {
    kind: 'finish',
    label: 'Chequered flag',
    kicker: `Chequered flag · Lap ${race.totalLaps}`,
    headline,
    dek,
    replay: { lap: race.totalLaps, cam: 'tv', focus: race.code(w.driverNumber) },
    results,
    fastestLap: fastest ? { code: race.code(fastest.dn), time: formatLapTime(fastest.t), lap: fastest.lap } : null,
  }
}

// ── The recap ───────────────────────────────────────────────────────────────

/**
 * @param pass     pickPass(inputs), when the loader went on to fetch its lap.
 * @param channels both cars' telemetry for the pass lap (null → no trace).
 */
export function buildRecap(
  inputs: RecapInputs,
  pass: PassPick | null = pickPass(inputs),
  channels: { a: LapChannels | null; b: LapChannels | null } | null = null,
): RaceRecap {
  const race = indexRace(inputs)
  const middle: RecapChapter[] = []
  const swing = pitSwingChapter(race, inputs)
  if (swing) middle.push(swing)
  if (pass) middle.push(battleChapter(race, inputs, pass, channels))
  middle.sort((x, y) => x.replay.lap - y.replay.lap)
  const finish = finishChapter(race)

  return {
    sample: false,
    sessionKey: inputs.session.session_key,
    gpName: inputs.session.gp_name ?? 'Grand Prix',
    season: inputs.session.season,
    round: inputs.session.round,
    totalLaps: race.totalLaps,
    drivers: [...race.drivers.values()],
    chapters: [startChapter(race), ...middle, ...(finish ? [finish] : [])],
  }
}
