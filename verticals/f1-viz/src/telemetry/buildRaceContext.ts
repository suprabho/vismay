/**
 * Build a RACE CONTEXT — the source material a VizF1 HTML story is written
 * from — for any set of ingested sessions (races, sprints, qualifying, practice,
 * across one weekend or a whole season) and the drivers the story is about.
 *
 * Where `buildTelemetryBrief` grounds one composed story on one session, this
 * is for a hand-written page that compares: drivers against each other, across
 * races and session types, with the championship as it stood after each round.
 * It renders, in order:
 *
 *   1. the drivers and teams in focus (codes, cars, team colours, logo and
 *      headshot URLs — the page's marks come from here);
 *   2. the head-to-head across every picked session (finish from grid, gap to
 *      the session's best lap, clean-lap pace, speed trap, laps led, points) and
 *      the totals and pairwise head-to-head counts;
 *   3. session by session: weather, the full classification, neutralisations,
 *      the focus drivers' performance (sectors, ideal lap, stints and stops),
 *      the session's key moments (./signals) and the lap-by-lap timing;
 *   4. the championship: points by round, the standings after each picked round
 *      and after the last one, drivers and constructors, computed from the
 *      ingested race and sprint results, with the official snapshot the ingest
 *      recorded beside it.
 *
 * Every figure comes from the vizf1 telemetry tables (FastF1 live timing, or
 * OpenF1 where FastF1 had nothing). Pure: takes a Supabase client and returns
 * markdown — no client construction. Server-only, behind the `./race-context`
 * subpath (not the package barrel), like `./telemetry-brief`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { analyseRace, deriveSignals, isCleanLap, type LapRow, type RaceAnalysis, type StintRow } from './signals'

/** Most sessions one context covers: a season's races plus a few qualifyings. */
export const MAX_RACE_CONTEXT_SESSIONS = 24
/** Most drivers one context follows; past this the per-driver tables stop reading. */
export const MAX_RACE_CONTEXT_DRIVERS = 8
/** With no drivers picked, the context follows this many (by points across the picked sessions). */
const DEFAULT_FOCUS_DRIVERS = 3
/** Lap-by-lap tables are written while the context covers at most this many sessions… */
const LAP_TABLE_MAX_SESSIONS = 6
/** …for at most this many drivers each (the first picked). */
const LAP_TABLE_MAX_DRIVERS = 4
/** Key moments per session. */
const MAX_MOMENTS = 4
/** Fastest laps listed per driver in a qualifying or practice session. */
const QUALI_LAPS_PER_DRIVER = 3
/** PostgREST caps a response at 1000 rows; a full race is ~1,250 lap rows. */
const LAP_PAGE = 1000
/** Sessions read at once — the database is shared by every prod vertical. */
const READ_CONCURRENCY = 3

// ── Row shapes (the telemetry tables' JSONB; see supabase/vizf1/migrations/004) ──

export interface ContextDriver {
  driverNumber: number
  abbreviation?: string
  fullName?: string
  firstName?: string
  lastName?: string
  teamName?: string
  teamId?: string
  teamColour?: string
  headshotUrl?: string | null
  countryCode?: string | null
  championshipPosition?: number | null
  championshipPoints?: number | null
  championshipWins?: number | null
}

export interface ContextResult {
  driverNumber: number
  abbreviation?: string
  gridPosition?: number | null
  position: number | null
  classifiedPosition?: string | null
  points?: number | null
  status?: string | null
  dnf?: boolean
  laps?: number | null
  q1TimeSec?: number | null
  q2TimeSec?: number | null
  q3TimeSec?: number | null
}

interface ContextWeather {
  lap: number
  airTemp?: number
  trackTemp?: number
  humidity?: number
  windSpeed?: number
  rainfall?: boolean
}

export interface ContextSession {
  session_key: string
  season: number
  round: number | null
  session_type: string
  session_name: string | null
  gp_name: string | null
  circuit_name: string | null
  country: string | null
  date_start: string | null
  data_source: string | null
  drivers: ContextDriver[] | null
  session_results: ContextResult[] | null
  stints: StintRow[] | null
  weather_data: ContextWeather[] | null
}

export interface ContextLap extends LapRow {
  tyre_life: number | null
  max_speed: number | null
  avg_throttle_pct: number | null
  drs_activations: number | null
}

const SESSION_COLUMNS =
  'session_key, season, round, session_type, session_name, gp_name, circuit_name, country, date_start, data_source, drivers, session_results, stints, weather_data'
const LAP_COLUMNS =
  'driver_number, lap, lap_time_sec, sectors, compound, tyre_life, min_gap_to_ahead_m, avg_speed, max_speed, avg_throttle_pct, drs_activations, position, events'

export interface RaceContextOptions {
  /** Telemetry session keys (e.g. `2026_australian_grand_prix_R`), up to {@link MAX_RACE_CONTEXT_SESSIONS}. */
  sessionKeys: string[]
  /**
   * The drivers the story is about, by three-letter code (`VER`, case-insensitive;
   * a code follows a driver across seasons and team changes) or car number
   * (`1`, matched per session). Empty: the top {@link DEFAULT_FOCUS_DRIVERS} by
   * points across the picked sessions.
   */
  drivers?: string[]
  /** Editorial intent, surfaced at the top of the context. */
  prompt?: string
  /** The VizF1 site (e.g. https://www.vizf1.com): team logos and race pages resolve against it. */
  siteUrl?: string
  /** "Now", for the current-season race links. Default: the clock. */
  now?: Date
}

// ── Small formatters ─────────────────────────────────────────────────────────

export type SessionKind = 'race' | 'quali' | 'practice'

/** R and S (sprint) are races; Q, SQ and SS (sprint qualifying / shootout) qualifying. */
export function sessionKind(type: string): SessionKind {
  const t = type.toUpperCase()
  if (t === 'R' || t === 'S') return 'race'
  if (t === 'Q' || t === 'SQ' || t === 'SS') return 'quali'
  return 'practice'
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  R: 'Race',
  S: 'Sprint',
  Q: 'Qualifying',
  SQ: 'Sprint qualifying',
  SS: 'Sprint shootout',
  FP1: 'Practice 1',
  FP2: 'Practice 2',
  FP3: 'Practice 3',
}

function typeLabel(s: ContextSession): string {
  return SESSION_TYPE_LABEL[s.session_type.toUpperCase()] ?? s.session_name ?? s.session_type
}

function gpName(s: ContextSession): string {
  return s.gp_name || s.circuit_name || s.session_key
}

/** "2026 Australian Grand Prix · Race" — the session's name everywhere in the context. */
function sessionTitle(s: ContextSession): string {
  return `${s.season} ${gpName(s)} · ${typeLabel(s)}`
}

/** 84.123 → "1:24.123"; 9.5 → "9.500". */
export function fmtLap(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const rest = (sec - m * 60).toFixed(3)
  return m > 0 ? `${m}:${rest.padStart(6, '0')}` : rest
}

/** A signed gap, "+0.123" / "−0.045" / "fastest". */
function fmtGap(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  if (Math.abs(sec) < 0.0005) return 'fastest'
  return `${sec > 0 ? '+' : '−'}${Math.abs(sec).toFixed(3)}`
}

function fmtNum(n: number | null | undefined, digits = 0, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}${suffix}`
}

function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** The vizf1 worker's slug (constructor_id = slug(team_name)). */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const pipe = (cells: Array<string | number>) => `| ${cells.join(' | ')} |`
const rule = (n: number) => `|${'---|'.repeat(n)}`

function code(d: ContextDriver | undefined, dn: number): string {
  return (d?.abbreviation || `#${dn}`).toUpperCase()
}

function fullName(d: ContextDriver | undefined): string {
  if (!d) return ''
  const n = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()
  return n || d.fullName || d.abbreviation || `#${d.driverNumber}`
}

/** Position a result finished in, or null when unclassified. */
function finishOf(r: ContextResult | undefined): number | null {
  if (!r) return null
  if (r.position != null) return r.position
  return r.classifiedPosition && /^\d+$/.test(r.classifiedPosition) ? Number(r.classifiedPosition) : null
}

/** FastF1's one-letter ClassifiedPosition codes for a car without a place. */
const UNCLASSIFIED: Record<string, string> = { R: 'DNF', D: 'DSQ', E: 'EXC', W: 'DNS', F: 'DNQ', N: 'NC' }

/** "P3", or the unclassified status ("DNF", "DSQ"), or "—". */
function finishLabel(r: ContextResult | undefined): string {
  const p = finishOf(r)
  if (p != null) return `P${p}`
  if (!r) return '—'
  const c = r.classifiedPosition?.trim()
  if (c && !/^\d+$/.test(c)) return UNCLASSIFIED[c.toUpperCase()] ?? c
  return r.dnf ? 'DNF' : 'NC'
}

// ── Per-driver, per-session figures ──────────────────────────────────────────

export interface DriverSessionStats {
  code: string
  driverNumber: number
  team: string
  kind: SessionKind
  /** R, S, Q, SQ, SS, FP1–3. */
  sessionType: string
  grid: number | null
  /** Grid 0: started from the pit lane. */
  pitLaneStart: boolean
  finish: number | null
  finishLabel: string
  points: number
  status: string
  bestLap: number | null
  bestLapNo: number | null
  /** Best lap minus the session's best lap (any driver). */
  gapToSessionBest: number | null
  /** Median of clean laps (no start, pit, SC/VSC or restart lap). */
  cleanPace: number | null
  cleanLaps: number
  topSpeed: number | null
  avgThrottle: number | null
  bestSectors: Array<number | null>
  idealLap: number | null
  lapsLed: number
  lapsCompleted: number
  qualiTimes: Array<number | null>
}

/** The fastest valid lap in a set of laps (an `incomplete` lap is not a lap time). */
function bestOf(laps: ContextLap[]): ContextLap | null {
  let best: ContextLap | null = null
  for (const l of laps) {
    if (!l.lap_time_sec || l.lap_time_sec <= 0 || (l.events ?? []).includes('incomplete')) continue
    if (!best || l.lap_time_sec < best.lap_time_sec!) best = l
  }
  return best
}

export function driverSessionStats(
  s: ContextSession,
  laps: ContextLap[],
  analysis: RaceAnalysis,
  dn: number,
): DriverSessionStats {
  const d = (s.drivers ?? []).find((x) => x.driverNumber === dn)
  const r = (s.session_results ?? []).find((x) => x.driverNumber === dn)
  const kind = sessionKind(s.session_type)
  const own = (analysis.byDriver.get(dn) ?? []) as ContextLap[]
  const best = bestOf(own)
  const sessionBest = bestOf(laps)
  const clean = kind === 'race' ? own.filter((l) => isCleanLap(analysis, l)) : []
  const speeds = own.map((l) => l.max_speed).filter((v): v is number => v != null && v > 0)
  const throttles = (clean.length ? clean : own)
    .map((l) => l.avg_throttle_pct)
    .filter((v): v is number => v != null)
  const bestSectors = [0, 1, 2].map((i) => {
    const xs = own
      .filter((l) => !(l.events ?? []).includes('incomplete'))
      .map((l) => l.sectors?.[i])
      .filter((v): v is number => v != null && v > 0)
    return xs.length ? Math.min(...xs) : null
  })
  const grid = r?.gridPosition ?? null
  return {
    code: code(d, dn),
    driverNumber: dn,
    team: d?.teamName ?? '',
    kind,
    sessionType: s.session_type.toUpperCase(),
    grid: grid != null && grid > 0 ? grid : null,
    pitLaneStart: kind === 'race' && grid === 0,
    finish: finishOf(r),
    finishLabel: finishLabel(r),
    points: r?.points ?? 0,
    status: r?.status ?? '',
    bestLap: best?.lap_time_sec ?? null,
    bestLapNo: best?.lap ?? null,
    gapToSessionBest: best?.lap_time_sec != null && sessionBest?.lap_time_sec != null ? best.lap_time_sec - sessionBest.lap_time_sec : null,
    cleanPace: median(clean.map((l) => l.lap_time_sec!)),
    cleanLaps: clean.length,
    topSpeed: speeds.length ? Math.max(...speeds) : null,
    avgThrottle: throttles.length ? throttles.reduce((a, b) => a + b, 0) / throttles.length : null,
    bestSectors,
    idealLap: bestSectors.every((x) => x != null) ? bestSectors.reduce((a, b) => a! + b!, 0) : null,
    lapsLed: kind === 'race' ? own.filter((l) => l.position === 1).length : 0,
    lapsCompleted: r?.laps ?? own.length,
    qualiTimes: [r?.q1TimeSec ?? null, r?.q2TimeSec ?? null, r?.q3TimeSec ?? null],
  }
}

// ── Focus drivers ────────────────────────────────────────────────────────────

/** The car number a focus token names in one session, or null when that driver didn't run in it. */
export function resolveDriverNumber(s: ContextSession, token: string): number | null {
  const t = token.trim().toUpperCase()
  if (!t) return null
  const roster = s.drivers ?? []
  const byCode = roster.find((d) => (d.abbreviation ?? '').toUpperCase() === t)
  if (byCode) return byCode.driverNumber
  if (/^\d+$/.test(t)) {
    const n = Number(t)
    if (roster.some((d) => d.driverNumber === n) || (s.session_results ?? []).some((r) => r.driverNumber === n)) return n
  }
  const byResult = (s.session_results ?? []).find((r) => (r.abbreviation ?? '').toUpperCase() === t)
  return byResult ? byResult.driverNumber : null
}

/**
 * The focus as driver CODES: the picked tokens resolved through the sessions'
 * rosters (a number becomes the code it carried), or — with none picked — the
 * top scorers across the picked sessions, best average finish breaking ties.
 */
export function resolveFocusCodes(sessions: ContextSession[], tokens: string[]): { codes: string[]; unmatched: string[]; defaulted: boolean } {
  const wanted = Array.from(new Set(tokens.map((t) => t.trim().toUpperCase()).filter(Boolean)))
  if (wanted.length) {
    const codes: string[] = []
    const unmatched: string[] = []
    for (const t of wanted) {
      let found: string | null = null
      for (const s of sessions) {
        const dn = resolveDriverNumber(s, t)
        if (dn != null) {
          found = code((s.drivers ?? []).find((d) => d.driverNumber === dn), dn)
          break
        }
      }
      if (found && !codes.includes(found)) codes.push(found)
      else if (!found) unmatched.push(t)
    }
    return { codes, unmatched, defaulted: false }
  }
  const tally = new Map<string, { points: number; finishes: number[] }>()
  for (const s of sessions) {
    for (const r of s.session_results ?? []) {
      const c = code((s.drivers ?? []).find((d) => d.driverNumber === r.driverNumber), r.driverNumber)
      const t = tally.get(c) ?? { points: 0, finishes: [] }
      t.points += r.points ?? 0
      const f = finishOf(r)
      if (f != null) t.finishes.push(f)
      tally.set(c, t)
    }
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 99)
  const codes = [...tally.entries()]
    .sort((a, b) => b[1].points - a[1].points || avg(a[1].finishes) - avg(b[1].finishes) || a[0].localeCompare(b[0]))
    .slice(0, DEFAULT_FOCUS_DRIVERS)
    .map(([c]) => c)
  return { codes, unmatched: [], defaulted: true }
}

// ── Championship ─────────────────────────────────────────────────────────────

export interface StandingRow {
  key: string
  name: string
  team: string
  points: number
  wins: number
  position: number
}

export interface RoundStandings {
  round: number
  gpName: string
  drivers: StandingRow[]
  constructors: StandingRow[]
}

export interface SeasonStandings {
  season: number
  /** Standings after each round that has an ingested race or sprint, in round order. */
  rounds: RoundStandings[]
  /** Rounds below the last covered one with no ingested race: the totals undercount them. */
  missingRounds: number[]
}

const sprintFirst = (s: ContextSession) => (s.session_type.toUpperCase() === 'S' ? 0 : 1)

/** Points, then wins, then name — the tie-break short of a full countback. */
function rank(rows: Map<string, Omit<StandingRow, 'position'>>): StandingRow[] {
  return [...rows.values()]
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, position: i + 1 }))
}

/**
 * Championship standings after each round, from the ingested race and sprint
 * classifications of one season (points as F1 awarded them; a race win counts
 * as a win, a sprint win doesn't). A driver's points go to the team they
 * scored them for.
 */
export function computeSeasonStandings(season: number, sessions: ContextSession[]): SeasonStandings {
  const scoring = sessions
    .filter((s) => s.season === season && s.round != null && sessionKind(s.session_type) === 'race')
    // A sprint scores before its weekend's Grand Prix.
    .sort((a, b) => a.round! - b.round! || sprintFirst(a) - sprintFirst(b))
  const drivers = new Map<string, Omit<StandingRow, 'position'>>()
  const teams = new Map<string, Omit<StandingRow, 'position'>>()
  const rounds: RoundStandings[] = []
  const covered = new Set<number>()
  for (let i = 0; i < scoring.length; i++) {
    const s = scoring[i]!
    for (const r of s.session_results ?? []) {
      const d = (s.drivers ?? []).find((x) => x.driverNumber === r.driverNumber)
      const c = code(d, r.driverNumber)
      const team = d?.teamName ?? ''
      const win = s.session_type.toUpperCase() === 'R' && finishOf(r) === 1 ? 1 : 0
      const pts = r.points ?? 0
      const dr = drivers.get(c) ?? { key: c, name: fullName(d) || c, team, points: 0, wins: 0 }
      dr.points += pts
      dr.wins += win
      if (team) dr.team = team
      drivers.set(c, dr)
      if (team) {
        const tk = slugify(team)
        const tr = teams.get(tk) ?? { key: tk, name: team, team, points: 0, wins: 0 }
        tr.points += pts
        tr.wins += win
        teams.set(tk, tr)
      }
    }
    if (s.session_type.toUpperCase() === 'R') covered.add(s.round!)
    const next = scoring[i + 1]
    if (!next || next.round !== s.round) {
      rounds.push({ round: s.round!, gpName: gpName(s), drivers: rank(drivers), constructors: rank(teams) })
    }
  }
  const last = rounds.at(-1)?.round ?? 0
  const missingRounds: number[] = []
  for (let r = 1; r <= last; r++) if (!covered.has(r)) missingRounds.push(r)
  return { season, rounds, missingRounds }
}

/** Standings after `round`: the last computed round at or before it. */
function standingsAfter(st: SeasonStandings, round: number): RoundStandings | null {
  let out: RoundStandings | null = null
  for (const r of st.rounds) if (r.round <= round) out = r
  return out
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** A PostgREST error isn't an Error: give callers one that says what failed. */
function dbError(what: string, e: { message?: string; code?: string }): Error {
  return new Error(`${what}: ${e.message ?? 'query failed'}${e.code ? ` (${e.code})` : ''}`)
}

async function fetchLaps(sb: SupabaseClient, sessionKey: string): Promise<ContextLap[]> {
  const out: ContextLap[] = []
  for (let from = 0; ; from += LAP_PAGE) {
    const { data, error } = await sb
      .from('vizf1_telemetry_laps')
      .select(LAP_COLUMNS)
      .eq('session_key', sessionKey)
      .order('lap', { ascending: true })
      .order('driver_number', { ascending: true })
      .range(from, from + LAP_PAGE - 1)
    if (error) throw dbError(`reading ${sessionKey} laps`, error)
    const rows = (data ?? []) as unknown as ContextLap[]
    out.push(...rows)
    if (rows.length < LAP_PAGE) return out
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

interface TeamMark {
  name: string
  colour: string | null
  logoUrl: string | null
}

/** Constructor logos and colours (vizf1_constructors, keyed by slug(team name)). Best-effort. */
async function fetchTeamMarks(sb: SupabaseClient, site: string): Promise<Map<string, TeamMark>> {
  const out = new Map<string, TeamMark>()
  const { data, error } = await sb.from('vizf1_constructors').select('constructor_id, name, logo_url, primary_color')
  if (error) return out
  for (const r of (data ?? []) as Array<{ constructor_id: string; name: string; logo_url: string | null; primary_color: string | null }>) {
    const logo = r.logo_url ? (r.logo_url.startsWith('/') ? (site ? `${site}${r.logo_url}` : null) : r.logo_url) : null
    out.set(r.constructor_id, { name: r.name, colour: r.primary_color, logoUrl: logo })
  }
  return out
}

/** This season's VizF1 race pages (/race/<schedule round>), keyed by slug(race name). Best-effort. */
async function fetchRacePages(sb: SupabaseClient, season: number, site: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!site) return out
  const { data, error } = await sb.from('vizf1_races').select('round, race_name').eq('season', String(season))
  if (error) return out
  for (const r of (data ?? []) as Array<{ round: number; race_name: string }>) {
    out.set(slugify(r.race_name), `${site}/race/${r.round}`)
  }
  return out
}

// ── Sections ─────────────────────────────────────────────────────────────────

interface Loaded {
  s: ContextSession
  laps: ContextLap[]
  analysis: RaceAnalysis
  /** code → car number in this session, for the focus drivers who ran in it. */
  focus: Map<string, number>
  stats: Map<string, DriverSessionStats>
}

function weatherLine(s: ContextSession): string | null {
  const w = s.weather_data ?? []
  if (!w.length) return null
  const range = (xs: number[], unit: string) => {
    if (!xs.length) return null
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    return Math.abs(hi - lo) < 0.5 ? `${lo.toFixed(0)}${unit}` : `${lo.toFixed(0)}–${hi.toFixed(0)}${unit}`
  }
  const air = range(w.map((x) => x.airTemp ?? NaN).filter(Number.isFinite), '°C')
  const track = range(w.map((x) => x.trackTemp ?? NaN).filter(Number.isFinite), '°C')
  const rainLaps = w.filter((x) => x.rainfall).map((x) => x.lap)
  const rain = rainLaps.length
    ? `rain on ${rainLaps.length} lap${rainLaps.length === 1 ? '' : 's'} (${lapRanges(rainLaps)})`
    : 'dry throughout'
  return [air && `air ${air}`, track && `track ${track}`, rain].filter(Boolean).join(', ')
}

/** [3,4,5,9] → "3–5, 9". */
function lapRanges(laps: number[]): string {
  const xs = [...new Set(laps)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < xs.length; i++) {
    let j = i
    while (j + 1 < xs.length && xs[j + 1] === xs[j]! + 1) j++
    out.push(i === j ? `${xs[i]}` : `${xs[i]}–${xs[j]}`)
    i = j
  }
  return out.join(', ')
}

function classificationTable(s: ContextSession, focus: Set<number>): string[] {
  const results = [...(s.session_results ?? [])].sort((a, b) => (finishOf(a) ?? 99) - (finishOf(b) ?? 99))
  if (!results.length) return []
  const drivers = s.drivers ?? []
  const kind = sessionKind(s.session_type)
  const who = (r: ContextResult) => {
    const d = drivers.find((x) => x.driverNumber === r.driverNumber)
    const label = `${fullName(d) || code(d, r.driverNumber)} (${code(d, r.driverNumber)} #${r.driverNumber})`
    return focus.has(r.driverNumber) ? `**${label}**` : label
  }
  const team = (r: ContextResult) => drivers.find((x) => x.driverNumber === r.driverNumber)?.teamName ?? ''
  const lines: string[] = []
  if (kind === 'race') {
    lines.push(pipe(['Pos', 'Driver', 'Team', 'Grid', 'Laps', 'Status', 'Pts']), rule(7))
    for (const r of results) {
      const grid = r.gridPosition === 0 ? 'pit lane' : r.gridPosition != null ? `P${r.gridPosition}` : '—'
      lines.push(pipe([finishLabel(r), who(r), team(r), grid, r.laps ?? '—', r.status ?? '', fmtPoints(r.points ?? 0)]))
    }
  } else if (kind === 'quali') {
    lines.push(pipe(['Pos', 'Driver', 'Team', 'Q1', 'Q2', 'Q3']), rule(6))
    for (const r of results) {
      lines.push(pipe([finishLabel(r), who(r), team(r), fmtLap(r.q1TimeSec), fmtLap(r.q2TimeSec), fmtLap(r.q3TimeSec)]))
    }
  } else {
    lines.push(pipe(['Pos', 'Driver', 'Team', 'Laps']), rule(4))
    for (const r of results) lines.push(pipe([finishLabel(r), who(r), team(r), r.laps ?? '—']))
  }
  return lines
}

/** Practice results often carry no order: rank by best lap instead. */
function practiceOrder(l: Loaded): string[] {
  const rows = [...l.analysis.byDriver.keys()]
    .map((dn) => ({ dn, best: bestOf((l.analysis.byDriver.get(dn) ?? []) as ContextLap[]) }))
    .filter((x) => x.best)
    .sort((a, b) => a.best!.lap_time_sec! - b.best!.lap_time_sec!)
  if (!rows.length) return []
  const top = rows[0]!.best!.lap_time_sec!
  const drivers = l.s.drivers ?? []
  const focus = new Set(l.focus.values())
  const lines = [pipe(['Pos', 'Driver', 'Team', 'Best lap', 'Gap', 'Laps']), rule(6)]
  rows.forEach((x, i) => {
    const d = drivers.find((y) => y.driverNumber === x.dn)
    const label = `${fullName(d) || code(d, x.dn)} (${code(d, x.dn)})`
    lines.push(
      pipe([
        `P${i + 1}`,
        focus.has(x.dn) ? `**${label}**` : label,
        d?.teamName ?? '',
        fmtLap(x.best!.lap_time_sec),
        fmtGap(x.best!.lap_time_sec! - top),
        (l.analysis.byDriver.get(x.dn) ?? []).length,
      ]),
    )
  })
  return lines
}

function stintLine(s: ContextSession, a: RaceAnalysis, dn: number): string {
  const stints = (s.stints ?? []).filter((x) => x.driverNumber === dn).sort((x, y) => x.startLap - y.startLap)
  const legs = stints.map((x) => `${(x.compound || '?').toLowerCase()} L${x.startLap}–${x.endLap}`)
  // Stops come from the stints and, where the feed left a stint open, the laps' pit_in flags.
  const stops = a.pitStops.filter((p) => p.driverNumber === dn)
  const losses = stops
    .map((p) => `L${p.lap}${p.lossSec != null ? ` ${p.lossSec.toFixed(1)}s` : ''}${p.neutralised ? ' (SC/VSC)' : ''}`)
    .join(', ')
  const parts = [
    legs.join(' → '),
    stops.length ? `${stops.length} stop${stops.length === 1 ? '' : 's'}: ${losses}` : stints.length ? 'no stops' : '',
  ].filter(Boolean)
  return parts.join('; ') || 'no stint data'
}

function performanceTable(l: Loaded, codes: string[]): string[] {
  const kind = sessionKind(l.s.session_type)
  const rows = codes.filter((c) => l.stats.has(c))
  if (!rows.length) return []
  const lines: string[] = []
  if (kind === 'race') {
    lines.push(
      pipe(['Driver', 'Grid → finish', 'Pts', 'Laps led', 'Best lap (lap)', 'vs session best', 'Clean-lap pace (laps)', 'Speed trap', 'Avg throttle']),
      rule(9),
    )
    for (const c of rows) {
      const x = l.stats.get(c)!
      const grid = x.pitLaneStart ? 'pit lane' : x.grid != null ? `P${x.grid}` : '—'
      lines.push(
        pipe([
          `${c} (${x.team})`,
          `${grid} → ${x.finishLabel}`,
          fmtPoints(x.points),
          x.lapsLed,
          `${fmtLap(x.bestLap)}${x.bestLapNo != null ? ` (L${x.bestLapNo})` : ''}`,
          fmtGap(x.gapToSessionBest),
          `${fmtLap(x.cleanPace)} (${x.cleanLaps})`,
          fmtNum(x.topSpeed, 0, ' km/h'),
          fmtNum(x.avgThrottle, 0, '%'),
        ]),
      )
    }
    lines.push('', '**Strategy** (compound and laps per stint; stops with pit-lane time lost):', '')
    for (const c of rows) lines.push(`- ${c}: ${stintLine(l.s, l.analysis, l.focus.get(c)!)}`)
  } else {
    lines.push(
      pipe(['Driver', 'Result', 'Best lap (lap)', 'vs session best', 'Best sectors', 'Ideal lap', 'Speed trap', 'Laps']),
      rule(8),
    )
    for (const c of rows) {
      const x = l.stats.get(c)!
      lines.push(
        pipe([
          `${c} (${x.team})`,
          x.finishLabel,
          `${fmtLap(x.bestLap)}${x.bestLapNo != null ? ` (L${x.bestLapNo})` : ''}`,
          fmtGap(x.gapToSessionBest),
          x.bestSectors.map((v) => fmtLap(v)).join(' / '),
          fmtLap(x.idealLap),
          fmtNum(x.topSpeed, 0, ' km/h'),
          (l.analysis.byDriver.get(x.driverNumber) ?? []).length,
        ]),
      )
    }
    lines.push('', `**Fastest laps** (up to ${QUALI_LAPS_PER_DRIVER} each: time, sectors, speed trap, tyre and its age):`, '')
    for (const c of rows) {
      const own = ((l.analysis.byDriver.get(l.focus.get(c)!) ?? []) as ContextLap[])
        .filter((x) => x.lap_time_sec && x.lap_time_sec > 0 && !(x.events ?? []).includes('incomplete'))
        .sort((a, b) => a.lap_time_sec! - b.lap_time_sec!)
        .slice(0, QUALI_LAPS_PER_DRIVER)
      const laps = own.map(
        (x) =>
          `L${x.lap} ${fmtLap(x.lap_time_sec)} (${(x.sectors ?? []).map((v) => fmtLap(v)).join(' / ') || 'no sectors'}; ${fmtNum(x.max_speed, 0, ' km/h')}; ${(x.compound || '?').toLowerCase()}${x.tyre_life != null ? `, ${x.tyre_life} laps old` : ''})`,
      )
      lines.push(`- ${c}: ${laps.join('; ') || 'no timed lap'}`)
    }
  }
  return lines
}

function momentsSection(l: Loaded, codes: string[]): string[] {
  if (sessionKind(l.s.session_type) !== 'race' || l.analysis.totalLaps < 2) return []
  const focusNums = new Set(codes.map((c) => l.focus.get(c)).filter((n): n is number => n != null))
  const signals = deriveSignals(l.laps, l.s.stints ?? [], l.s.drivers ?? [], l.analysis)
  // Never filtered, only re-ranked: a focus driver's moment moves up.
  const score = (x: (typeof signals)[number]) => x.priority + (x.driverNumbers.some((n) => focusNums.has(n)) ? 0.3 : 0)
  const top = [...signals].sort((a, b) => score(b) - score(a)).slice(0, MAX_MOMENTS)
  if (!top.length) return []
  return top.map((x) => `- **${x.title}** (laps ${x.lapFrom === x.lapTo ? x.lapFrom : `${x.lapFrom}–${x.lapTo}`}). ${x.detail}`)
}

function lapTable(l: Loaded, codes: string[]): string[] {
  const shown = codes.filter((c) => l.focus.has(c)).slice(0, LAP_TABLE_MAX_DRIVERS)
  if (!shown.length || l.analysis.totalLaps < 2) return []
  const lines = [
    pipe(['Lap', ...shown, 'Track']),
    rule(shown.length + 2),
  ]
  for (let lap = 1; lap <= l.analysis.totalLaps; lap++) {
    const cells = shown.map((c) => {
      const dn = l.focus.get(c)!
      const row = (l.analysis.byLap.get(lap) ?? []).find((x) => x.driver_number === dn) as ContextLap | undefined
      if (!row) return '—'
      const pit = l.analysis.pitLapKeys.has(`${dn}:${lap}`) ? ' pit' : ''
      const tyre = row.compound ? ` ${row.compound[0]!.toUpperCase()}` : ''
      const pos = row.position != null ? `P${row.position}` : 'P?'
      return `${pos} ${fmtLap(row.lap_time_sec)}${tyre}${pit}`
    })
    const track = l.analysis.redFlagLaps.includes(lap) ? 'red flag' : l.analysis.neutralisedLaps.has(lap) ? 'SC/VSC' : ''
    lines.push(pipe([lap, ...cells, track]))
  }
  return lines
}

function headToHead(loaded: Loaded[], codes: string[]): string[] {
  const lines: string[] = []
  const cell = (l: Loaded, c: string): string => {
    const x = l.stats.get(c)
    if (!x) return 'did not run'
    if (x.kind === 'race') {
      const grid = x.pitLaneStart ? 'pit lane' : x.grid != null ? `P${x.grid}` : '?'
      return `${x.finishLabel} from ${grid}, ${fmtPoints(x.points)} pts`
    }
    return x.finishLabel
  }
  lines.push('**Results**', '', pipe(['Session', ...codes]), rule(codes.length + 1))
  for (const l of loaded) lines.push(pipe([sessionTitle(l.s), ...codes.map((c) => cell(l, c))]))

  lines.push('', "**Best lap against the session's best** (same session only: never compare circuits)", '')
  lines.push(pipe(['Session', ...codes]), rule(codes.length + 1))
  for (const l of loaded) {
    lines.push(
      pipe([
        sessionTitle(l.s),
        ...codes.map((c) => {
          const x = l.stats.get(c)
          return x ? `${fmtLap(x.bestLap)} (${fmtGap(x.gapToSessionBest)})` : '—'
        }),
      ]),
    )
  }

  const races = loaded.filter((l) => sessionKind(l.s.session_type) === 'race')
  if (races.length) {
    lines.push('', '**Race pace**: median clean lap, and its gap to the quickest focus driver in that race', '')
    lines.push(pipe(['Session', ...codes]), rule(codes.length + 1))
    for (const l of races) {
      const paces = codes.map((c) => l.stats.get(c)?.cleanPace ?? null)
      const best = Math.min(...paces.filter((p): p is number => p != null))
      lines.push(
        pipe([
          sessionTitle(l.s),
          ...paces.map((p) => (p == null ? '—' : `${fmtLap(p)} (${Number.isFinite(best) ? fmtGap(p - best) : '—'})`)),
        ]),
      )
    }
  }

  lines.push('', '**Speed trap** (highest speed on any lap, km/h)', '')
  lines.push(pipe(['Session', ...codes]), rule(codes.length + 1))
  for (const l of loaded) lines.push(pipe([sessionTitle(l.s), ...codes.map((c) => fmtNum(l.stats.get(c)?.topSpeed, 0))]))

  // Totals over the picked race sessions.
  if (races.length) {
    lines.push('', `**Totals across the ${races.length} picked race${races.length === 1 ? '' : 's'} and sprint${races.length === 1 ? '' : 's'}**`, '')
    lines.push(pipe(['Driver', 'Starts', 'Points', 'GP wins', 'Podiums', 'Avg finish', 'Best', 'Places gained', 'Laps led', 'Not classified']), rule(10))
    for (const c of codes) {
      const xs = races.map((l) => l.stats.get(c)).filter((x): x is DriverSessionStats => !!x)
      const fin = xs.map((x) => x.finish).filter((f): f is number => f != null)
      const gained = xs
        .filter((x) => x.grid != null && x.finish != null)
        .reduce((a, x) => a + (x.grid! - x.finish!), 0)
      lines.push(
        pipe([
          c,
          xs.length,
          fmtPoints(xs.reduce((a, x) => a + x.points, 0)),
          xs.filter((x) => x.finish === 1 && x.sessionType === 'R').length,
          xs.filter((x) => x.finish != null && x.finish <= 3).length,
          fin.length ? (fin.reduce((a, b) => a + b, 0) / fin.length).toFixed(1) : '—',
          fin.length ? `P${Math.min(...fin)}` : '—',
          gained > 0 ? `+${gained}` : String(gained),
          xs.reduce((a, x) => a + x.lapsLed, 0),
          xs.length - fin.length,
        ]),
      )
    }
  }

  // Pairwise: who finished ahead, by session kind.
  if (codes.length >= 2) {
    lines.push('', '**Head-to-head** (sessions where both were classified: row driver ahead – column driver ahead)', '')
    for (const [kind, label] of [
      ['race', 'Races and sprints'],
      ['quali', 'Qualifying'],
    ] as const) {
      const ls = loaded.filter((l) => sessionKind(l.s.session_type) === kind)
      if (!ls.length) continue
      lines.push(`_${label}_`, '', pipe(['', ...codes]), rule(codes.length + 1))
      for (const a of codes) {
        lines.push(
          pipe([
            a,
            ...codes.map((b) => {
              if (a === b) return '·'
              let ahead = 0
              let behind = 0
              for (const l of ls) {
                const fa = l.stats.get(a)?.finish
                const fb = l.stats.get(b)?.finish
                if (fa == null || fb == null) continue
                if (fa < fb) ahead++
                else behind++
              }
              return `${ahead}–${behind}`
            }),
          ]),
        )
      }
      lines.push('')
    }
  }
  return lines
}

function standingsSection(
  st: SeasonStandings,
  pickedRounds: number[],
  codes: string[],
  snapshot: ContextSession | null,
): string[] {
  const lines: string[] = []
  if (!st.rounds.length) return lines
  const last = Math.max(...pickedRounds)
  const final = standingsAfter(st, last)
  lines.push(`### ${st.season} championship`, '')
  lines.push(
    `Computed from the ${st.season} race and sprint results ingested for rounds ${lapRanges(st.rounds.map((r) => r.round))}` +
      ' (points as awarded; ties broken by wins, then name).' +
      (st.missingRounds.length
        ? ` **${st.missingRounds.length === 1 ? 'Round' : 'Rounds'} ${lapRanges(st.missingRounds)} ${st.missingRounds.length === 1 ? 'has' : 'have'} no ingested race, so every total below undercounts ${st.missingRounds.length === 1 ? 'it' : 'them'}: say so, or use the official snapshot.**`
        : ''),
    '',
  )

  // Points by round, for a championship-progression chart.
  const through = st.rounds.filter((r) => r.round <= last)
  lines.push('**Cumulative points by round** (position in brackets)', '')
  lines.push(pipe(['Round', 'Grand Prix', ...codes, 'Leader']), rule(codes.length + 3))
  for (const r of through) {
    const leader = r.drivers[0]
    lines.push(
      pipe([
        r.round,
        r.gpName,
        ...codes.map((c) => {
          const row = r.drivers.find((x) => x.key === c)
          return row ? `${fmtPoints(row.points)} (P${row.position})` : '—'
        }),
        leader ? `${leader.key} ${fmtPoints(leader.points)}` : '—',
      ]),
    )
  }

  if (final) {
    lines.push('', `**Drivers after round ${final.round} (${final.gpName})**: the top 10 and every focus driver`, '')
    lines.push(pipe(['Pos', 'Driver', 'Team', 'Pts', 'Wins', 'Behind leader']), rule(6))
    const lead = final.drivers[0]?.points ?? 0
    for (const r of final.drivers.filter((x) => x.position <= 10 || codes.includes(x.key))) {
      const name = codes.includes(r.key) ? `**${r.name} (${r.key})**` : `${r.name} (${r.key})`
      lines.push(pipe([r.position, name, r.team, fmtPoints(r.points), r.wins, r.position === 1 ? '—' : fmtPoints(lead - r.points)]))
    }
    lines.push('', `**Constructors after round ${final.round}**`, '')
    lines.push(pipe(['Pos', 'Team', 'Pts', 'Wins']), rule(4))
    for (const r of final.constructors) lines.push(pipe([r.position, r.name, fmtPoints(r.points), r.wins]))
  }

  const snap = (snapshot?.drivers ?? []).filter((d) => d.championshipPosition != null)
  if (snapshot && snap.length) {
    const shown = snap
      .filter((d) => (d.championshipPosition ?? 99) <= 5 || codes.includes(code(d, d.driverNumber)))
      .sort((a, b) => a.championshipPosition! - b.championshipPosition!)
    lines.push(
      '',
      `**Official snapshot**: the championship as F1's records (Ergast) stood when ${sessionTitle(snapshot)} was ingested. ` +
        'It can include rounds the table above lacks, or lag a round behind it: date it if you use it.',
      '',
    )
    lines.push(pipe(['Pos', 'Driver', 'Pts', 'Wins']), rule(4))
    for (const d of shown) {
      lines.push(pipe([d.championshipPosition!, `${fullName(d)} (${code(d, d.driverNumber)})`, fmtPoints(d.championshipPoints ?? 0), d.championshipWins ?? '—']))
    }
  }
  lines.push('')
  return lines
}

// ── The context ──────────────────────────────────────────────────────────────

export async function buildRaceContext(sb: SupabaseClient, opts: RaceContextOptions): Promise<string> {
  const keys = Array.from(new Set(opts.sessionKeys.map((k) => k.trim()).filter(Boolean)))
  if (!keys.length) throw new Error('No sessions picked')
  if (keys.length > MAX_RACE_CONTEXT_SESSIONS) throw new Error(`At most ${MAX_RACE_CONTEXT_SESSIONS} sessions per race context`)
  const tokens = (opts.drivers ?? []).map((t) => t.trim()).filter(Boolean)
  if (tokens.length > MAX_RACE_CONTEXT_DRIVERS) throw new Error(`At most ${MAX_RACE_CONTEXT_DRIVERS} drivers per race context`)
  const site = (opts.siteUrl ?? '').replace(/\/$/, '')

  const { data, error } = await sb.from('vizf1_telemetry_sessions').select(SESSION_COLUMNS).in('session_key', keys)
  if (error) throw dbError('reading the sessions', error)
  const sessions = ((data ?? []) as unknown as ContextSession[]).sort(
    (a, b) => (a.date_start ?? '').localeCompare(b.date_start ?? '') || a.session_key.localeCompare(b.session_key),
  )
  const missing = keys.filter((k) => !sessions.some((s) => s.session_key === k))
  if (!sessions.length) throw new Error(`No ingested sessions for ${keys.join(', ')}`)

  const { codes, unmatched, defaulted } = resolveFocusCodes(sessions, tokens)
  const seasons = Array.from(new Set(sessions.map((s) => s.season))).sort()

  const [loaded, seasonRows, marks, racePages] = await Promise.all([
    mapLimit(sessions, READ_CONCURRENCY, async (s): Promise<Loaded> => {
      const laps = await fetchLaps(sb, s.session_key)
      const analysis = analyseRace(laps, s.stints ?? [])
      const focus = new Map<string, number>()
      for (const c of codes) {
        const dn = resolveDriverNumber(s, c)
        if (dn != null) focus.set(c, dn)
      }
      const stats = new Map<string, DriverSessionStats>()
      for (const [c, dn] of focus) stats.set(c, driverSessionStats(s, laps, analysis, dn))
      return { s, laps, analysis, focus, stats }
    }),
    // Every race and sprint of the picked seasons, for the standings.
    sb
      .from('vizf1_telemetry_sessions')
      .select('session_key, season, round, session_type, session_name, gp_name, circuit_name, date_start, drivers, session_results')
      .in('season', seasons)
      .in('session_type', ['R', 'S'])
      .then(({ data: rows, error: e }) => {
        if (e) throw dbError('reading the season results', e)
        return (rows ?? []) as unknown as ContextSession[]
      }),
    fetchTeamMarks(sb, site),
    (async () => {
      const year = (opts.now ?? new Date()).getUTCFullYear()
      return seasons.includes(year) ? fetchRacePages(sb, year, site) : new Map<string, string>()
    })(),
  ])

  const lines: string[] = []
  const weekends = new Set(sessions.map((s) => `${s.season}:${s.gp_name}`)).size
  lines.push(`# Race context: ${codes.join(', ') || 'the field'} across ${sessions.length} session${sessions.length === 1 ? '' : 's'}`, '')
  if (opts.prompt?.trim()) lines.push(`> **Editorial focus:** ${opts.prompt.trim()}`, '')
  lines.push(
    `${sessions.length} session${sessions.length === 1 ? '' : 's'} from ${weekends} race weekend${weekends === 1 ? '' : 's'} (${seasons.join(', ')}), in date order: ` +
      sessions.map((s) => sessionTitle(s)).join('; ') +
      '.',
    '',
  )
  if (missing.length) lines.push(`_Not ingested, so left out: ${missing.join(', ')}._`, '')
  if (unmatched.length) lines.push(`_No driver ${unmatched.join(', ')} ran in these sessions._`, '')
  lines.push(
    'How to read this: every figure comes from the timing feed (FastF1 live timing, or OpenF1 where FastF1 had ' +
      'nothing). Lap times are m:ss.sss. "Clean" laps exclude the opening lap, in- and out-laps, and laps under the ' +
      'safety car or VSC (and the restart lap after one): those are slow by design, never a driver losing pace. ' +
      '"vs session best" is the gap to the fastest lap anyone set in that session. Speed trap is the highest speed ' +
      'the car recorded on any lap. The timing feed marks a safety car and a VSC the same way, so "SC/VSC" means ' +
      'either: call it what the race reports call it, or "the neutralisation". Never quote session keys.',
    '',
  )

  // 1. Who.
  lines.push(`## Drivers in focus${defaulted ? ' (none were picked: the top scorers across these sessions)' : ''}`, '')
  if (codes.length) {
    lines.push(pipe(['Code', 'Driver', 'Car', 'Team (colour)', 'Nationality', 'Headshot']), rule(6))
    for (const c of codes) {
      const seen = loaded.filter((l) => l.focus.has(c))
      const latest = seen.at(-1)
      const d = latest ? (latest.s.drivers ?? []).find((x) => x.driverNumber === latest.focus.get(c)) : undefined
      const teams = Array.from(
        new Set(
          seen
            .map((l) => (l.s.drivers ?? []).find((x) => x.driverNumber === l.focus.get(c))?.teamName)
            .filter((t): t is string => !!t),
        ),
      )
      const cars = Array.from(new Set(seen.map((l) => `#${l.focus.get(c)}`)))
      lines.push(
        pipe([
          c,
          fullName(d) || c,
          cars.join(', ') || '—',
          teams.map((t) => `${t}${d && d.teamName === t && d.teamColour ? ` (${d.teamColour})` : ''}`).join(' → ') || '—',
          d?.countryCode ?? '—',
          d?.headshotUrl ?? '—',
        ]),
      )
    }
    lines.push('')
  }
  const teamNames = Array.from(new Set(sessions.flatMap((s) => (s.drivers ?? []).map((d) => d.teamName).filter((t): t is string => !!t))))
  if (teamNames.length) {
    lines.push('**Teams** (colour from the timing feed; logos are white glyphs: dark or team-coloured backgrounds only)', '')
    lines.push(pipe(['Team', 'Colour', 'Logo']), rule(3))
    for (const t of teamNames.sort()) {
      const colour = sessions.flatMap((s) => s.drivers ?? []).find((d) => d.teamName === t)?.teamColour
      const m = marks.get(slugify(t))
      lines.push(pipe([t, colour ?? m?.colour ?? '—', m?.logoUrl ?? '—']))
    }
    lines.push('')
  }

  // 2. Across sessions.
  if (codes.length) {
    lines.push('## Head-to-head across the picked sessions', '')
    lines.push(...headToHead(loaded, codes), '')
  }

  // 3. Session by session.
  lines.push('## Session by session', '')
  const lapTables = loaded.length <= LAP_TABLE_MAX_SESSIONS
  for (const l of loaded) {
    const s = l.s
    const kind = sessionKind(s.session_type)
    lines.push(`### ${sessionTitle(s)}`, '')
    const page = racePages.get(slugify(s.gp_name ?? ''))
    lines.push(
      [
        s.round != null ? `Round ${s.round}` : null,
        s.circuit_name ? `${s.circuit_name}${s.country ? `, ${s.country}` : ''}` : s.country,
        s.date_start ? `${s.date_start.slice(0, 10)} (UTC)` : null,
        kind === 'race' && l.analysis.totalLaps ? `${l.analysis.totalLaps} laps` : null,
        s.data_source ? `timing: ${s.data_source === 'openf1' ? 'OpenF1' : 'FastF1'}` : null,
        page ? `VizF1 race page: ${page}` : null,
      ]
        .filter(Boolean)
        .join(' · ') + '.',
      '',
    )
    const weather = weatherLine(s)
    if (weather) lines.push(`Weather: ${weather}.`, '')

    const table = kind === 'practice' && !(s.session_results ?? []).some((r) => finishOf(r) != null)
      ? practiceOrder(l)
      : classificationTable(s, new Set(l.focus.values()))
    if (table.length) lines.push(`**${kind === 'race' ? 'Result' : 'Classification'}** (focus drivers in bold)`, '', ...table, '')

    if (kind === 'race' && (l.analysis.windows.length || l.analysis.redFlagLaps.length)) {
      const parts = [
        ...l.analysis.windows.map((w) => (w.lapFrom === w.lapTo ? `lap ${w.lapFrom}` : `laps ${w.lapFrom}–${w.lapTo}`)),
      ]
      lines.push(
        `Neutralised (SC/VSC): ${parts.join(', ') || 'none'}.` +
          (l.analysis.redFlagLaps.length
            ? ` Red flag after lap ${l.analysis.redFlagLaps.join(', ')}: the field pitted and changed tyres for free; those are not strategic stops.`
            : ''),
        '',
      )
    }

    if (l.focus.size) {
      lines.push('**Focus drivers**', '', ...performanceTable(l, codes), '')
    } else if (codes.length) {
      lines.push(`_None of ${codes.join(', ')} ran in this session._`, '')
    }

    const moments = momentsSection(l, codes)
    if (moments.length) lines.push('**Key moments** (most story-worthy first)', '', ...moments, '')

    if (kind === 'race' && lapTables) {
      const lt = lapTable(l, codes)
      if (lt.length) {
        lines.push(
          '**Lap by lap** (position at the end of the lap, lap time, tyre: S/M/H/I/W, "pit" on in- and out-laps)',
          '',
          ...lt,
          '',
        )
      }
    }
  }
  if (!lapTables && loaded.some((l) => sessionKind(l.s.session_type) === 'race')) {
    lines.push(
      `_Lap-by-lap tables are left out past ${LAP_TABLE_MAX_SESSIONS} sessions; the per-session figures above still hold. Pick fewer sessions for them._`,
      '',
    )
  }

  // 4. Championship.
  const standingsLines: string[] = []
  for (const season of seasons) {
    const picked = sessions.filter((s) => s.season === season && s.round != null).map((s) => s.round!)
    if (!picked.length) continue
    const st = computeSeasonStandings(season, seasonRows)
    const latestIngested = seasonRows
      .filter((s) => s.season === season)
      .sort((a, b) => (b.date_start ?? '').localeCompare(a.date_start ?? ''))[0]
    standingsLines.push(...standingsSection(st, picked, codes, latestIngested ?? null))
  }
  if (standingsLines.length) lines.push('## Championship standings', '', ...standingsLines)

  lines.push('## Sources', '')
  lines.push('- Laps, sectors, speed traps, stints, weather and classifications: F1 live timing via FastF1, or OpenF1, as ingested by VizF1.')
  lines.push('- Championship tables: computed by VizF1 from those race and sprint classifications; the official snapshot is Ergast/Jolpica.')
  if (racePages.size) lines.push(`- Race pages: ${site}/race/<round> (linked per session above).`)
  lines.push('')
  return lines.join('\n')
}

/** Internal helpers, exported for the checks in buildRaceContext.test.ts. */
export const __test = { lapRanges, fmtGap, standingsAfter }
