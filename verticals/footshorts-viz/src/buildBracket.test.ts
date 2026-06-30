/** Throwaway check: buildBracket must not crash when a knockout stage is seeded
 *  with all-TBD ties (both teams unknown), which drop their legs internally.
 *  This reproduces the World Cup hub crash: sorting ties read kickoff_at off an
 *  empty legs array. (run: npx tsx src/buildBracket.test.ts) */
import { buildBracket } from './buildBracket'
import type { FixtureRow } from './types'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

function tbdFixture(over: Partial<FixtureRow>): FixtureRow {
  return {
    id: 'x',
    competition_slug: 'world-cup',
    season: '2026',
    stage: 'ROUND_OF_16',
    matchday: null,
    kickoff_at: '2026-07-04T18:00:00Z',
    status: 'scheduled',
    home_score: null,
    away_score: null,
    home_team_name: 'TBD',
    away_team_name: 'TBD',
    home: null,
    away: null,
    ...over,
  } as FixtureRow
}

// World Cup before the knockout draw: football-data.org seeds each R16 slot
// with descriptive placeholders ("Winner Group A" vs "Runner-up Group B"). The
// team *refs* are null, so each tie is `bothUnknown` and drops its legs — yet
// the distinct names keep them as separate ties, so the round has several ties
// with empty legs to sort. That's the exact shape that crashed the hub.
const undrawn = [
  tbdFixture({
    id: 'a',
    kickoff_at: '2026-07-04T18:00:00Z',
    home_team_name: 'Winner Group C',
    away_team_name: 'Runner-up Group D',
  }),
  tbdFixture({
    id: 'b',
    kickoff_at: '2026-07-04T14:00:00Z',
    home_team_name: 'Winner Group A',
    away_team_name: 'Runner-up Group B',
  }),
  tbdFixture({
    id: 'c',
    kickoff_at: '2026-07-05T18:00:00Z',
    home_team_name: 'Winner Group E',
    away_team_name: 'Runner-up Group F',
  }),
]

let bracket: ReturnType<typeof buildBracket> = null
let threw = false
try {
  bracket = buildBracket(undrawn)
} catch (err) {
  threw = true
  console.log('  threw:', (err as Error).message)
}

ok('does not throw on all-TBD knockout round', !threw)
ok('returns a bracket', !!bracket)
ok('has one round with all ties', bracket?.rounds[0]?.ties.length === 3)
ok(
  'orders TBD ties by source kickoff (b, a, c)',
  bracket?.rounds[0]?.ties.map((t) => t.id).join(',') === 'b,a,c',
  bracket?.rounds[0]?.ties.map((t) => t.id).join(','),
)

// Mixed round: a real (drawn) tie keeps its legs and still sorts correctly
// alongside a TBD-only tie.
const real = tbdFixture({
  id: 'real',
  kickoff_at: '2026-07-04T10:00:00Z',
  home_team_name: 'Brazil',
  away_team_name: 'France',
  home: { id: 'bra', name: 'Brazil' } as FixtureRow['home'],
  away: { id: 'fra', name: 'France' } as FixtureRow['away'],
})
const mixed = buildBracket([
  tbdFixture({ id: 'tbd', kickoff_at: '2026-07-04T18:00:00Z' }),
  real,
])
ok(
  'real tie sorts ahead of later TBD tie',
  mixed?.rounds[0]?.ties[0]?.teamAName === 'Brazil',
  mixed?.rounds[0]?.ties[0]?.teamAName,
)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
