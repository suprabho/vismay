import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  espnLeagueBySlug,
  parseEspnMatchUrl,
  parseEspnScoreboard,
  scoreboardMonths,
  summaryLeagueCode,
} from '@footshorts/shared/espnLeagues';
import { matchFixtures } from './theanalyst/matchDiscovery';

test('parseEspnMatchUrl reads the gameId off any ESPN edition and page', () => {
  assert.equal(parseEspnMatchUrl('https://www.espn.in/football/match/_/gameId/401882816/barcelona-atletico-madrid'), '401882816');
  assert.equal(parseEspnMatchUrl('https://www.espn.com/soccer/matchstats/_/gameId/401882816'), '401882816');
  assert.equal(parseEspnMatchUrl('https://www.espn.co.uk/football/commentary/_/gameId/401882816'), '401882816');
  assert.equal(parseEspnMatchUrl('https://africa.espn.com/football/match?gameId=401882816'), '401882816');
  assert.equal(parseEspnMatchUrl(' https://www.espn.com.au/football/lineups/_/gameId/401882816 '), '401882816');
});

test('parseEspnMatchUrl rejects other hosts and links without a numeric gameId', () => {
  assert.equal(parseEspnMatchUrl('https://theanalyst.com/opta-football-match-centre?competitionId=1&seasonId=2&matchId=3'), null);
  assert.equal(parseEspnMatchUrl('https://notespn.com/football/match/_/gameId/401882816'), null);
  assert.equal(parseEspnMatchUrl('https://www.espn.in/football/match/_/gameId/abc'), null);
  assert.equal(parseEspnMatchUrl('https://www.espn.in/football/scoreboard'), null);
  assert.equal(parseEspnMatchUrl('not a url'), null);
});

test('scoreboardMonths covers each kickoff and the day before it', () => {
  assert.deepEqual(scoreboardMonths(['2026-11-08T20:00:00Z', '2026-10-19T19:00:00Z']), ['202610', '202611']);
  // 00:30 UTC on the 1st is still the previous day (and month) in US Eastern.
  assert.deepEqual(scoreboardMonths(['2026-11-01T00:30:00Z']), ['202610', '202611']);
  assert.deepEqual(scoreboardMonths(['garbage']), []);
});

function event(id: string, date: string, home: string, away: string, completed = true) {
  return {
    id,
    date,
    status: { type: { completed } },
    competitions: [{
      date,
      status: { type: { completed } },
      // Away first on purpose: never assume home-first ordering.
      competitors: [
        { homeAway: 'away', team: { displayName: away } },
        { homeAway: 'home', team: { displayName: home } },
      ],
    }],
  };
}

const LALIGA = espnLeagueBySlug('primera-division')!;

test('parseEspnScoreboard keeps two-sided events and checks the league', () => {
  const payload = {
    leagues: [{ slug: 'esp.1' }],
    events: [
      event('401882816', '2026-11-08T20:00Z', 'Atlético Madrid', 'Barcelona'),
      event('401882817', '2026-11-09T20:00Z', 'Real Madrid', 'Sevilla', false),
      { id: 'x', competitions: [] },
    ],
  };
  const matches = parseEspnScoreboard(payload, LALIGA);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches[0], {
    espn_event_id: '401882816',
    league_code: 'esp.1',
    kickoff_at: '2026-11-08T20:00:00.000Z',
    home_team_name: 'Atlético Madrid',
    away_team_name: 'Barcelona',
    completed: true,
  });
  assert.equal(matches[1]!.completed, false);
  assert.throws(() => parseEspnScoreboard({ leagues: [{ slug: 'eng.1' }], events: [] }, LALIGA), /got eng\.1/);
  assert.throws(() => parseEspnScoreboard({}, LALIGA), /missing events/);
});

test("ESPN names match football-data's official names, and Atlético is not Real Madrid", () => {
  const espn = [
    event('401882816', '2026-11-08T20:00Z', 'Atlético Madrid', 'Barcelona'),
    event('401882810', '2026-11-08T15:15Z', 'Real Madrid', 'Rayo Vallecano'),
    event('401882811', '2026-11-09T17:30Z', 'Athletic Club', 'Real Sociedad'),
  ];
  const candidates = parseEspnScoreboard({ leagues: [{ slug: 'esp.1' }], events: espn }, LALIGA).map((m) => ({
    matchId: m.espn_event_id,
    competitionId: m.league_code,
    seasonId: '',
    homeTeamRaw: m.home_team_name,
    awayTeamRaw: m.away_team_name,
    kickoffDate: m.kickoff_at,
  }));
  const resolved = matchFixtures(candidates, [
    { id: 'atm-bar', homeTeamName: 'Club Atlético de Madrid', awayTeamName: 'FC Barcelona', kickoffAt: '2026-11-08T20:00:00Z' },
    { id: 'rma-ray', homeTeamName: 'Real Madrid CF', awayTeamName: 'Rayo Vallecano de Madrid', kickoffAt: '2026-11-08T15:15:00Z' },
    { id: 'ath-rso', homeTeamName: 'Athletic Club', awayTeamName: 'Real Sociedad de Fútbol', kickoffAt: '2026-11-09T17:30:00Z' },
    // Reverse fixture later in the season: must not take the November match.
    { id: 'bar-atm', homeTeamName: 'FC Barcelona', awayTeamName: 'Club Atlético de Madrid', kickoffAt: '2026-11-08T20:00:00Z' },
  ]);
  assert.equal(resolved.get('atm-bar')?.matchId, '401882816');
  assert.equal(resolved.get('rma-ray')?.matchId, '401882810');
  assert.equal(resolved.get('ath-rso')?.matchId, '401882811');
  assert.equal(resolved.has('bar-atm'), false);
});

test('summaryLeagueCode reads header.league.slug', () => {
  assert.equal(summaryLeagueCode({ header: { league: { slug: 'esp.1' } } }), 'esp.1');
  assert.equal(summaryLeagueCode({}), null);
});
