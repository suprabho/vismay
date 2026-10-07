/**
 * Race context checks (run: npx tsx verticals/f1-viz/src/telemetry/buildRaceContext.test.ts)
 *
 * A synthetic 2026 season against a stub Supabase client: round 1 (race and
 * qualifying), round 2 (sprint and race), no round 3, round 4 (race). Checks
 * that drivers resolve by code or number across sessions, that pace only reads
 * clean laps, that the head-to-head skips unclassified finishes, and that the
 * standings count sprint points, credit wins only for Grand Prix races and own
 * up to the missing round.
 */
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildRaceContext,
  computeSeasonStandings,
  driverSessionStats,
  fmtLap,
  resolveFocusCodes,
  sessionKind,
  type ContextLap,
  type ContextSession,
} from './buildRaceContext'
import { analyseRace } from './signals'

const roster = [
  { driverNumber: 1, abbreviation: 'VER', firstName: 'Max', lastName: 'Verstappen', teamName: 'Red Bull Racing', teamColour: '#3671C6', countryCode: 'NED', headshotUrl: 'https://img/ver.png' },
  { driverNumber: 4, abbreviation: 'NOR', firstName: 'Lando', lastName: 'Norris', teamName: 'McLaren', teamColour: '#FF8000', countryCode: 'GBR' },
  { driverNumber: 16, abbreviation: 'LEC', firstName: 'Charles', lastName: 'Leclerc', teamName: 'Ferrari', teamColour: '#E8002D', countryCode: 'MON' },
]

type Finish = { dn: number; pos: number | null; grid?: number; pts: number; status?: string }

function session(key: string, round: number, type: string, gp: string, date: string, finishes: Finish[]): ContextSession {
  return {
    session_key: key,
    season: 2026,
    round,
    session_type: type,
    session_name: null,
    gp_name: gp,
    circuit_name: null,
    country: null,
    date_start: date,
    data_source: 'fastf1',
    drivers: roster,
    session_results: finishes.map((f) => ({
      driverNumber: f.dn,
      abbreviation: roster.find((d) => d.driverNumber === f.dn)!.abbreviation,
      gridPosition: f.grid ?? null,
      position: f.pos,
      classifiedPosition: f.pos == null ? 'R' : String(f.pos),
      points: f.pts,
      status: f.status ?? 'Finished',
      laps: 5,
      q1TimeSec: type === 'Q' ? 80 + f.dn / 10 : null,
      q2TimeSec: null,
      q3TimeSec: null,
    })),
    stints: [],
    weather_data: [{ lap: 1, airTemp: 21, trackTemp: 35, rainfall: false }],
  }
}

const AUS_R = session('2026_australian_grand_prix_R', 1, 'R', 'Australian Grand Prix', '2026-03-08T04:00:00Z', [
  { dn: 1, pos: 1, grid: 2, pts: 25 },
  { dn: 4, pos: 2, grid: 1, pts: 18 },
  { dn: 16, pos: 3, grid: 3, pts: 15 },
])
const AUS_Q = session('2026_australian_grand_prix_Q', 1, 'Q', 'Australian Grand Prix', '2026-03-07T05:00:00Z', [
  { dn: 4, pos: 1, pts: 0 },
  { dn: 1, pos: 2, pts: 0 },
  { dn: 16, pos: 3, pts: 0 },
])
const CHN_S = session('2026_chinese_grand_prix_S', 2, 'S', 'Chinese Grand Prix', '2026-03-14T03:00:00Z', [
  { dn: 1, pos: 1, grid: 1, pts: 8 },
  { dn: 4, pos: 2, grid: 2, pts: 7 },
  { dn: 16, pos: 3, grid: 3, pts: 6 },
])
const CHN_R = session('2026_chinese_grand_prix_R', 2, 'R', 'Chinese Grand Prix', '2026-03-15T07:00:00Z', [
  { dn: 4, pos: 1, grid: 2, pts: 25 },
  { dn: 16, pos: 2, grid: 3, pts: 18 },
  { dn: 1, pos: null, grid: 1, pts: 0, status: 'Retired' },
])
const JPN_R = session('2026_japanese_grand_prix_R', 4, 'R', 'Japanese Grand Prix', '2026-04-05T05:00:00Z', [
  { dn: 1, pos: 1, grid: 1, pts: 25 },
  { dn: 4, pos: 2, grid: 2, pts: 18 },
  { dn: 16, pos: 3, grid: 3, pts: 15 },
])
const SESSIONS = [AUS_R, AUS_Q, CHN_S, CHN_R, JPN_R]

/** Five laps a car; lap 1 slow (standing start), lap 3 VER pits (slow in-lap and out-lap). */
function lapsFor(s: ContextSession): ContextLap[] {
  const out: ContextLap[] = []
  for (const f of s.session_results ?? []) {
    for (let lap = 1; lap <= 5; lap++) {
      const pit = s.session_key === AUS_R.session_key && f.driverNumber === 1 && lap === 3
      const base = 90 + f.driverNumber / 100
      out.push({
        driver_number: f.driverNumber,
        lap,
        lap_time_sec: lap === 1 ? 99 : pit ? 110 : base + lap / 100,
        sectors: [30, 30 + f.driverNumber / 100, 30],
        compound: 'MEDIUM',
        tyre_life: lap,
        min_gap_to_ahead_m: null,
        avg_speed: null,
        max_speed: 320 - f.driverNumber,
        avg_throttle_pct: 60,
        drs_activations: 1,
        position: f.position ?? 3,
        events: pit ? ['pit_in'] : [],
      })
    }
  }
  return out
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

assert.equal(sessionKind('R'), 'race')
assert.equal(sessionKind('s'), 'race')
assert.equal(sessionKind('SQ'), 'quali')
assert.equal(sessionKind('FP2'), 'practice')
assert.equal(fmtLap(84.123), '1:24.123')
assert.equal(fmtLap(65.05), '1:05.050')
assert.equal(fmtLap(null), '—')

// Codes and car numbers resolve to codes; an unknown code is reported.
assert.deepEqual(resolveFocusCodes(SESSIONS, ['ver', '4', 'XYZ']), { codes: ['VER', 'NOR'], unmatched: ['XYZ'], defaulted: false })
// No picks: the top scorers across the picked sessions (NOR 68 > VER 58 > LEC 54).
assert.deepEqual(resolveFocusCodes(SESSIONS, []).codes, ['NOR', 'VER', 'LEC'])

// Pace reads clean laps only: VER's lap-1 start and lap-3 in-lap / lap-4 out-lap are out.
{
  const laps = lapsFor(AUS_R)
  const a = analyseRace(laps, [])
  const ver = driverSessionStats(AUS_R, laps, a, 1)
  assert.equal(ver.grid, 2)
  assert.equal(ver.finish, 1)
  assert.equal(ver.cleanLaps, 2, 'laps 2 and 5 are clean; 1 is the start, 3–4 the stop')
  assert.equal(ver.topSpeed, 319)
  assert.ok(Math.abs(ver.idealLap! - 90.01) < 1e-9)
  assert.equal(ver.sessionType, 'R')
  const nor = driverSessionStats(AUS_R, laps, a, 4)
  assert.ok(nor.gapToSessionBest! > 0, 'VER (car 1) set the best lap; NOR is behind it')
}

// Standings: sprint points count, only a Grand Prix win is a win, round 3 is missing.
{
  const st = computeSeasonStandings(2026, SESSIONS)
  assert.deepEqual(st.rounds.map((r) => r.round), [1, 2, 4])
  assert.deepEqual(st.missingRounds, [3])
  const r2 = st.rounds[1]!
  assert.deepEqual(
    r2.drivers.map((d) => [d.key, d.points, d.wins, d.position]),
    [
      ['NOR', 50, 1, 1],
      ['LEC', 39, 0, 2],
      ['VER', 33, 1, 3],
    ],
  )
  assert.equal(r2.constructors[0]!.name, 'McLaren')
  assert.equal(st.rounds[2]!.drivers[0]!.key, 'NOR')
  assert.equal(st.rounds[2]!.drivers[0]!.points, 68)
}

// ── End to end, against a stub client ─────────────────────────────────────────

type Row = Record<string, unknown>
const TABLES: Record<string, Row[]> = {
  vizf1_telemetry_sessions: SESSIONS as unknown as Row[],
  vizf1_telemetry_laps: SESSIONS.flatMap((s) => lapsFor(s).map((l) => ({ ...l, session_key: s.session_key }))),
  vizf1_constructors: [
    { constructor_id: 'red_bull_racing', name: 'Red Bull Racing', logo_url: '/constructors/red_bull_racing.svg', primary_color: '#3671C6' },
  ],
  vizf1_races: [{ season: '2026', round: 3, race_name: 'Australian Grand Prix' }],
}

/** Just enough of the PostgREST builder: select, eq, in, order, range, then. */
function stubClient(): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(TABLES[table] ?? [])]
      let range: [number, number] | null = null
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => ((rows = rows.filter((r) => String(r[col]) === String(v))), q),
        in: (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.map(String).includes(String(r[col])))), q),
        order: () => q,
        range: (from: number, to: number) => ((range = [from, to]), q),
        then: (ok: (v: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null }).then(ok),
      }
      return q
    },
  } as unknown as SupabaseClient
}

async function main() {
  const md = await buildRaceContext(stubClient(), {
    sessionKeys: [AUS_R.session_key, AUS_Q.session_key, CHN_R.session_key, 'nope_R'],
    drivers: ['VER', 'nor'],
    prompt: 'Who blinked first?',
    siteUrl: 'https://www.vizf1.com/',
    now: new Date('2026-04-10T00:00:00Z'),
  })

  if (process.env.DUMP) console.log(md)
  assert.ok(md.startsWith('# Race context: VER, NOR across 3 sessions'))
  assert.ok(md.includes('> **Editorial focus:** Who blinked first?'))
  assert.ok(md.includes('_Not ingested, so left out: nope_R._'))
  // Sessions in date order: qualifying before the race it set the grid for.
  assert.ok(md.indexOf('### 2026 Australian Grand Prix · Qualifying') < md.indexOf('### 2026 Australian Grand Prix · Race'))
  // Team marks resolve against the site; race pages only for this season.
  assert.ok(md.includes('| Red Bull Racing | #3671C6 | https://www.vizf1.com/constructors/red_bull_racing.svg |'))
  assert.ok(md.includes('VizF1 race page: https://www.vizf1.com/race/3'))
  // Head-to-head: AUS R counts (VER ahead), CHN R doesn't (VER retired); qualifying NOR 1–0.
  assert.match(md, /_Races and sprints_\n\n\|  \| VER \| NOR \|\n\|---\|---\|---\|\n\| VER \| · \| 1–0 \|/)
  assert.match(md, /_Qualifying_\n\n\|  \| VER \| NOR \|\n\|---\|---\|---\|\n\| VER \| · \| 0–1 \|/)
  assert.ok(md.includes('| 2026 Chinese Grand Prix · Race | DNF from P1, 0 pts | P1 from P2, 25 pts |'))
  // Lap-by-lap: VER's in-lap is marked, with position and tyre.
  assert.ok(md.includes('| 3 | P1 1:50.000 M pit |'))
  // With no stint rows the stop still shows, from the lap's pit_in flag.
  assert.ok(md.includes('- VER: 1 stop: L3'))
  // Standings through the last picked round (2), with the sprint, and the missing round 3 owned up to.
  assert.ok(md.includes('**Drivers after round 2 (Chinese Grand Prix)**'))
  assert.ok(md.includes('| 1 | **Lando Norris (NOR)** | McLaren | 50 | 1 | — |'))
  assert.ok(!md.includes('after round 4'), 'standings stop at the last picked round')
  assert.ok(md.includes('**Round 3 has no ingested race, so every total below undercounts it'))
  assert.ok(!/2026_[a-z_]+_R/.test(md.replace('nope_R', '')), 'session keys never reach the prose')

  // Guard rails.
  await assert.rejects(buildRaceContext(stubClient(), { sessionKeys: [] }), /No sessions picked/)
  await assert.rejects(buildRaceContext(stubClient(), { sessionKeys: ['nope_R'] }), /No ingested sessions/)

  console.log('buildRaceContext: all checks passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
