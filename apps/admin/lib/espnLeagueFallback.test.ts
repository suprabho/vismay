/** The ESPN league fallback's brief section. (run: pnpm --filter admin exec tsx lib/espnLeagueFallback.test.ts) */
import assert from 'node:assert/strict'
import type { EspnMatchDetail, EspnSideFacts } from '@footshorts/shared/espnMatch'
import { formatCupMatchContext } from './espnCupContext'
import { leagueRowToCupFixture, type EspnLeagueMatchRow } from './espnLeagueFallback'

const facts = (over: Partial<EspnSideFacts>): EspnSideFacts => ({
  possession: null, shots: null, shots_on_target: null, corners: null, fouls: null, yellow_cards: null,
  red_cards: null, offsides: null, saves: null, passes: null, pass_accuracy: null, raw_stats: {}, ...over,
})
const counts = { goals: 0, yellow_cards: 0, red_cards: 0, substitutions: 0, penalties_scored: 0, penalties_missed: 0 }

const detail = {
  espn_event_id: '401882816',
  competition_slug: 'primera-division',
  source_url: 'https://www.espn.com/soccer/match/_/gameId/401882816',
  fetched_at: '2026-11-09T11:00:00.000Z',
  kickoff_at: '2026-11-08T20:00:00.000Z',
  status: { state: 'post', name: 'STATUS_FULL_TIME', description: 'Full Time', detail: 'FT', completed: true },
  season_name: '2026-27 LALIGA',
  venue: 'Estadio Metropolitano',
  attendance: 68000,
  referee: null,
  home: { espn_id: '1068', name: 'Atlético Madrid', abbreviation: 'ATM', logo_url: 'https://a.espncdn.com/atm.png', color: 'cb3524', score: 1, shootout_score: null, winner: false },
  away: { espn_id: '83', name: 'Barcelona', abbreviation: 'BAR', logo_url: 'https://a.espncdn.com/bar.png', color: null, score: 2, shootout_score: null, winner: true },
  timeline: [
    { espn_id: '1', kind: 'goal', label: 'Goal', minute: 10, extra_minute: null, period: 1, clock_label: "10'", side: 'home', team_name: 'Atlético Madrid', player: 'Giuliano Simeone', secondary: null, text: '', scoring_play: true },
    { espn_id: '2', kind: 'goal', label: 'Goal', minute: 66, extra_minute: null, period: 2, clock_label: "66'", side: 'away', team_name: 'Barcelona', player: 'Fermín López', secondary: null, text: '', scoring_play: true },
  ],
  events: [],
  facts: { home: facts({ possession: 37, shots: 9, pass_accuracy: 80 }), away: facts({ possession: 63, shots: 19, pass_accuracy: 90 }) },
  derived: { home: counts, away: counts },
  lineups: null,
  commentary: [{ sequence: 1, clock_label: "66'", text: 'Goal! Fermín López wins it.' }],
  notes: [],
} satisfies EspnMatchDetail

const row: EspnLeagueMatchRow = {
  fixture_id: '3f1c2b9e-0000-4000-8000-000000000000',
  espn_event_id: '401882816',
  espn_league_code: 'esp.1',
  competition_slug: 'primera-division',
  detail,
  fetched_at: detail.fetched_at,
}

const fixture = leagueRowToCupFixture(row)
assert.equal(fixture.status, 'finished')
assert.equal(fixture.home_score, 1)
assert.equal(fixture.away_score, 2)
assert.equal(fixture.winner_espn_id, '83')
assert.equal(fixture.season_start, 2026)
assert.equal(fixture.espn_competition_code, 'esp.1')

const md = formatCupMatchContext(
  [
    {
      fixture,
      cupName: 'LaLiga',
      seasonLabel: '2026/27',
      home: { name: 'Atlético Madrid', crestUrl: null, color: null, pageUrl: 'https://footshorts.com/team/atletico-madrid' },
      away: { name: 'Barcelona', crestUrl: null, color: null, pageUrl: null },
      detail,
    },
  ],
  { variant: 'league' },
)
assert.match(md, /^# ESPN match detail — Atlético Madrid 1–2 Barcelona \(LaLiga\)/)
assert.match(md, /Opta’s match facts \(theanalyst\.com\) are missing/)
assert.match(md, /ESPN has no xG/)
// The cup wording must not leak into the league section: these matches DO have pages.
assert.doesNotMatch(md, /There is no footshorts match page/)
assert.doesNotMatch(md, /Cup match context/)
assert.match(md, /### Match facts \(ESPN team statistics\)/)
assert.match(md, /\| Possession \| 37% \| 63% \|/)
assert.match(md, /\| Pass accuracy \| 80% \| 90% \|/)
assert.match(md, /- 66' \(Barcelona\) Goal — Fermín López/)
assert.match(md, /- 66': Goal! Fermín López wins it\./)

// The default stays the cup wording.
assert.match(formatCupMatchContext([{ fixture, cupName: 'LaLiga', seasonLabel: '2026/27', home: { name: 'A', crestUrl: null, color: null, pageUrl: null }, away: { name: 'B', crestUrl: null, color: null, pageUrl: null }, detail }]), /^# Cup match context/)

console.log('espnLeagueFallback: ok')
