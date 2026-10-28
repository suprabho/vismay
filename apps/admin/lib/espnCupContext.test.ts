/** The HTML-story brief's cup match context. (run: pnpm --filter admin exec tsx lib/espnCupContext.test.ts) */
import assert from 'node:assert/strict'
import type { CupFixture } from '@footshorts/shared/espnCups'
import type { EspnMatchDetail } from '@footshorts/shared/espnMatch'
import { cupScoreline, formatCupMatchContext } from './espnCupContext'

const fixture: CupFixture = {
  espn_event_id: '735531',
  competition_slug: 'fa-cup',
  espn_competition_code: 'eng.fa',
  season_start: 2025,
  round_label: 'Third Round',
  kickoff_at: '2026-01-10T15:00:00Z',
  kickoff_time_confirmed: true,
  status: 'finished',
  status_detail: 'FT-Pens',
  home_espn_id: '359',
  away_espn_id: '363',
  home_team_name: 'Arsenal',
  away_team_name: 'Chelsea',
  home_score: 1,
  away_score: 1,
  home_penalties: 4,
  away_penalties: 3,
  winner_espn_id: '359',
  venue: 'Emirates Stadium',
  notes: ['Arsenal advance 4-3 on penalties'],
  source_url: 'https://www.espn.com/soccer/match/_/gameId/735531',
  fetched_at: '2026-01-10T18:00:00Z',
}

const side = { goals: 1, yellow_cards: 2, red_cards: 0, substitutions: 5, penalties_scored: 0, penalties_missed: 0 }
const detail = {
  espn_event_id: '735531',
  competition_slug: 'fa-cup',
  source_url: fixture.source_url,
  fetched_at: fixture.fetched_at,
  kickoff_at: fixture.kickoff_at,
  status: { state: 'post', description: 'Final', detail: 'FT-Pens', completed: true },
  season_name: null,
  venue: 'Emirates Stadium',
  attendance: 60123,
  referee: 'Michael Oliver',
  home: { espn_id: '359', name: 'Arsenal', abbreviation: 'ARS', logo_url: null, color: 'ef0107', score: 1, shootout_score: 4, winner: true },
  away: { espn_id: '363', name: 'Chelsea', abbreviation: 'CHE', logo_url: null, color: null, score: 1, shootout_score: 3, winner: false },
  timeline: [
    { espn_id: '1', kind: 'period', label: 'Kickoff', minute: 0, extra_minute: null, period: 1, clock_label: "0'", side: null, team_name: null, player: null, secondary: null, text: '', scoring_play: false },
    { espn_id: '2', kind: 'goal', label: 'Goal', minute: 23, extra_minute: null, period: 1, clock_label: "23'", side: 'home', team_name: 'Arsenal', player: 'Bukayo Saka', secondary: 'Martin Ødegaard', text: '', scoring_play: true },
    { espn_id: '3', kind: 'substitution', label: 'Substitution', minute: 70, extra_minute: null, period: 2, clock_label: "70'", side: 'away', team_name: 'Chelsea', player: 'Nicolas Jackson', secondary: 'Cole Palmer', text: '', scoring_play: false },
  ],
  events: [],
  facts: null,
  derived: { home: side, away: { ...side, yellow_cards: 3 } },
  lineups: null,
  commentary: [
    { sequence: 5, clock_label: "23'", text: 'Goal! Saka finishes low.' },
    { sequence: 4, clock_label: "22'", text: 'Arsenal build from the back.' },
  ],
} satisfies EspnMatchDetail

assert.equal(cupScoreline(fixture), 'Arsenal 1–1 Chelsea (4–3 pens)')

const md = formatCupMatchContext(
  [
    {
      fixture,
      cupName: 'FA Cup',
      seasonLabel: '2025/26',
      home: { name: 'Arsenal', crestUrl: 'https://example.com/ars.png', color: '#ef0107', pageUrl: 'https://footshorts.com/team/arsenal' },
      away: { name: 'Chelsea', crestUrl: null, color: null, pageUrl: null },
      detail,
    },
  ],
  { prompt: 'The shootout' },
)
assert.match(md, /^# Cup match context — Arsenal 1–1 Chelsea \(4–3 pens\) \(FA Cup\)/)
assert.match(md, /> \*\*Editorial focus:\*\* The shootout/)
assert.match(md, /FA Cup 2025\/26, Third Round · Sat,? 10 Jan 2026, 15:00 UTC · Full time \(FT-Pens\) · Emirates Stadium\./)
assert.match(md, /Attendance 60,123 · Referee Michael Oliver\./)
assert.match(md, /ESPN note: Arsenal advance 4-3 on penalties/)
assert.match(md, /team page https:\/\/footshorts\.com\/team\/arsenal/)
assert.match(md, /### Match counts \(from the timeline\)/)
assert.match(md, /\| Yellow cards \| 2 \| 3 \|/)
assert.match(md, /- 23' \(Arsenal\) Goal — Bukayo Saka \(assist: Martin Ødegaard\)/)
assert.match(md, /- 70' \(Chelsea\) Substitution — Nicolas Jackson replaces Cole Palmer/)
assert.doesNotMatch(md, /Kickoff/)
assert.match(md, /- 23': Goal! Saka finishes low\./)
assert.doesNotMatch(md, /build from the back/)
assert.match(md, /Decided on penalties, 4–3/)

// Not extracted yet: the scoreline only, and a note saying so.
const bare = formatCupMatchContext([
  { fixture, cupName: 'FA Cup', seasonLabel: '2025/26', home: { name: 'Arsenal', crestUrl: null, color: null, pageUrl: null }, away: { name: 'Chelsea', crestUrl: null, color: null, pageUrl: null }, detail: null },
])
assert.match(bare, /has not been extracted/)
assert.doesNotMatch(bare, /### Timeline/)

console.log('espnCupContext: ok')
