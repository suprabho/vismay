/** Throwaway check: season labels order chronologically across both shapes
 *  ("26-27" and "2026"), and groupFixturesByRound never merges same-numbered
 *  matchdays from different seasons — the fixtures table keeps every season it
 *  has ingested, so a Champions League schedule read without a season filter
 *  used to render 26-27, 25-26 and 24-25 as one "Matchday 1".
 *  (run: npx tsx src/season.test.ts) */
import {
  compareSeasons,
  formatSeason,
  latestSeason,
  seasonStartAt,
  seasonStartYear,
} from './season'
import { groupFixturesByRound } from './scheduleRounds'
import type { FixtureRow } from './types'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

// --- labels ---------------------------------------------------------------
ok('seasonStartYear parses league labels', seasonStartYear('26-27') === 2026)
ok('seasonStartYear parses cup labels', seasonStartYear('2026') === 2026)
ok('seasonStartYear rejects junk', seasonStartYear('next') === null)

ok('26-27 is newer than 25-26', compareSeasons('26-27', '25-26') > 0)
// A plain string sort puts "2026" before "25-26" (it compares '0' against '5'),
// which would age a 2026 cup out of the current season. compareSeasons reads
// the start years instead: the 2026 cup began after the 25-26 league did.
ok(
  'a cup label is not aged out by string ordering',
  '2026' < '25-26' && compareSeasons('2026', '25-26') > 0,
)
ok('latestSeason picks the newest', latestSeason(['24-25', '26-27', '25-26']) === '26-27')
ok('latestSeason of nothing is null', latestSeason([]) === null)
ok('formatSeason renders a league season', formatSeason('26-27') === '2026/27')
ok('formatSeason leaves a cup season alone', formatSeason('2026') === '2026')

// --- season boundary ------------------------------------------------------
ok(
  'September falls in the season that just started',
  seasonStartAt(new Date('2026-09-09T00:00:00Z')).toISOString() === '2026-06-01T00:00:00.000Z',
)
ok(
  'March falls in the season that started last summer',
  seasonStartAt(new Date('2027-03-01T00:00:00Z')).toISOString() === '2026-06-01T00:00:00.000Z',
)
ok(
  "last season's final sits before the new season's start",
  new Date('2026-05-30T19:00:00Z') < seasonStartAt(new Date('2026-09-09T00:00:00Z')),
)

// --- schedule rounds ------------------------------------------------------
function fixture(over: Partial<FixtureRow> & { id: string; season: string }): FixtureRow {
  return {
    competition_slug: 'champions-league',
    matchday: 1,
    stage: 'LEAGUE_STAGE',
    kickoff_at: '2026-09-16T19:00:00Z',
    status: 'scheduled',
    home_score: null,
    away_score: null,
    home_team_name: 'Home',
    away_team_name: 'Away',
    home: null,
    away: null,
    ...over,
  } as FixtureRow
}

const mixed = [
  fixture({ id: 'now', season: '26-27', kickoff_at: '2026-09-16T19:00:00Z' }),
  fixture({ id: 'last', season: '25-26', kickoff_at: '2025-09-17T19:00:00Z' }),
  fixture({ id: 'older', season: '24-25', kickoff_at: '2024-09-17T19:00:00Z' }),
]
const rounds = groupFixturesByRound(mixed)
ok('one round per season, never merged', rounds.length === 3, `got ${rounds.length}`)
ok('every round holds a single season', rounds.every((r) => r.fixtures.length === 1))
ok('current season sorts first', rounds[0]!.season === '26-27' && rounds[0]!.fixtures[0]!.id === 'now')
ok(
  'rounds still carry their matchday label',
  rounds.every((r) => r.label === 'Matchday 1'),
)

const singleSeason = groupFixturesByRound([
  fixture({ id: 'a', season: '26-27' }),
  fixture({ id: 'b', season: '26-27', kickoff_at: '2026-09-16T16:45:00Z' }),
  fixture({ id: 'c', season: '26-27', matchday: 2, kickoff_at: '2026-09-30T19:00:00Z' }),
])
ok('a scoped list still groups by matchday', singleSeason.length === 2)
ok(
  'fixtures inside a round stay kickoff-sorted',
  singleSeason[0]!.fixtures.map((f) => f.id).join(',') === 'b,a',
)

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
