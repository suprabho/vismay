/** Throwaway check for the team-calendar helpers: month parsing, the padded
 *  7-column grid, and a team's fixtures read from its own perspective.
 *  (run: npx tsx src/teamCalendar.test.ts) */
import {
  calendarMonthOf,
  defaultCalendarMonth,
  formatCalendarMonth,
  monthGrid,
  parseCalendarMonth,
  teamFixturesInMonth,
  teamMonths,
  weekdayInitials,
} from './teamCalendar'
import { getCompetitionShortCode } from './competitionMeta'
import type { FixtureRow } from './types'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

// --- month parsing ---------------------------------------------------------
ok('parses YYYY-MM', JSON.stringify(parseCalendarMonth('2026-10')) === '{"year":2026,"month":9}')
ok('rejects month 13', parseCalendarMonth('2026-13') === null)
ok('rejects junk', parseCalendarMonth('oct-2026') === null)
ok('rejects non-strings', parseCalendarMonth(202610) === null)
ok('formats heading', formatCalendarMonth('2026-10') === 'October 2026')
ok('month of an instant is UTC', calendarMonthOf('2026-10-31T23:30:00Z') === '2026-10')

// --- grid -----------------------------------------------------------------
// October 2026 starts on a Thursday and has 31 days.
const oct = monthGrid('2026-10')
ok('October 2026 spans 5 weeks (Mon-first)', oct.length === 5, `got ${oct.length}`)
ok('every row has 7 cells', oct.every((r) => r.length === 7))
ok('Mon-first: first three cells pad', oct[0]!.slice(0, 3).every((c) => c === null))
ok('Mon-first: the 1st sits under Thursday', oct[0]![3]?.day === 1)
ok('last day is the 31st', oct[4]!.some((c) => c?.day === 31))
const octSun = monthGrid('2026-10', 'sun')
ok('Sun-first: the 1st sits under Thursday (index 4)', octSun[0]![4]?.day === 1)
ok('Sun-first weekday order', weekdayInitials('sun').join('') === 'SMTWTFS')
ok('Mon-first weekday order', weekdayInitials('mon').join('') === 'MTWTFSS')
ok('bad month → empty grid', monthGrid('nope').length === 0)
// February 2027 starts on Monday and has 28 days → exactly 4 full rows.
ok('February 2027 is exactly 4 rows', monthGrid('2027-02').length === 4)

// --- team perspective -----------------------------------------------------
const ars = { id: 'ars-id', slug: 'arsenal', name: 'Arsenal', crest_url: null }
const che = { id: 'che-id', slug: 'chelsea', name: 'Chelsea', crest_url: null }
const bay = { id: 'bay-id', slug: 'bayern', name: 'Bayern', crest_url: null }
const fx = (
  id: string,
  kickoff: string,
  home: typeof ars,
  away: typeof ars,
  comp: string,
  score?: [number, number],
): FixtureRow => ({
  id,
  competition_slug: comp,
  season: '26-27',
  matchday: null,
  stage: null,
  kickoff_at: kickoff,
  status: score ? 'finished' : 'scheduled',
  home_score: score ? score[0] : null,
  away_score: score ? score[1] : null,
  home_team_name: home.name,
  away_team_name: away.name,
  home,
  away,
})
const fixtures: FixtureRow[] = [
  fx('a', '2026-10-03T14:00:00Z', ars, che, 'premier-league', [2, 1]),
  fx('b', '2026-10-21T19:00:00Z', bay, ars, 'champions-league', [3, 1]),
  fx('c', '2026-10-25T15:30:00Z', che, ars, 'premier-league'),
  fx('d', '2026-11-01T15:30:00Z', ars, bay, 'champions-league'),
  fx('e', '2026-10-10T15:00:00Z', che, bay, 'premier-league'), // not Arsenal's
]

const mine = teamFixturesInMonth(fixtures, 'arsenal', '2026-10')
ok('three Arsenal fixtures in October', mine.length === 3, `got ${mine.length}`)
ok('kickoff order', mine.map((m) => m.fixture.id).join('') === 'abc')
ok('matches by entity id too', teamFixturesInMonth(fixtures, 'ars-id', '2026-10').length === 3)
ok('home flag', mine[0]!.home === true && mine[1]!.home === false)
ok('opponent from the team perspective', mine[1]!.opponentName === 'Bayern')
ok('score from the team perspective', JSON.stringify(mine[1]!.score) === '[1,3]')
ok('result W / L / null', mine[0]!.result === 'W' && mine[1]!.result === 'L' && mine[2]!.result === null)
ok('UTC day of month', mine[2]!.day === 25)

const months = teamMonths(fixtures, 'arsenal')
ok('months with counts', JSON.stringify(months) === '[{"month":"2026-10","count":3},{"month":"2026-11","count":1}]')

ok(
  'default month = next unplayed fixture',
  defaultCalendarMonth(fixtures, 'arsenal', new Date('2026-10-26T00:00:00Z')) === '2026-11',
)
ok(
  'default month = next unplayed fixture (mid-month)',
  defaultCalendarMonth(fixtures, 'arsenal', new Date('2026-10-05T00:00:00Z')) === '2026-10',
)
ok(
  'default month falls back to the last fixture once the season is over',
  defaultCalendarMonth(fixtures, 'arsenal', new Date('2027-06-01T00:00:00Z')) === '2026-11',
)
ok(
  'default month falls back to now with no fixtures',
  defaultCalendarMonth([], 'arsenal', new Date('2027-06-01T00:00:00Z')) === '2027-06',
)

// --- competition chips ----------------------------------------------------
ok('known short code', getCompetitionShortCode('champions-league') === 'UCL')
ok('initials fallback from display name', getCompetitionShortCode('primeira-liga') === 'LP')
ok('initials fallback from slug words', getCompetitionShortCode('scottish-premiership') === 'SP')
ok('single-word slug fallback', getCompetitionShortCode('allsvenskan') === 'ALL')
ok('empty slug → empty chip', getCompetitionShortCode(null) === '')

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
