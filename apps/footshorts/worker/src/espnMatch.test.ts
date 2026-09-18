import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ESPN_CUPS } from '@footshorts/shared/espnCups';
import { classifyEspnEvent, normalizeEspnMatch, parseEspnClock, slimEspnSummary, timelineToEvents } from '@footshorts/shared/espnMatch';

const cup = ESPN_CUPS[0];
const ctx = { eventId: '735531', cup, fetchedAt: '2026-09-18T08:00:00.000Z' };

function keyEvent(type: string, text: string, opts: { clock?: string; period?: number; team?: string; players?: string[]; scoring?: boolean; id?: string; typeText?: string } = {}) {
  return {
    id: opts.id ?? `${type}-${opts.clock ?? ''}`,
    type: { type, text: opts.typeText ?? type },
    text,
    period: { number: opts.period ?? 1 },
    clock: { displayValue: opts.clock ?? '' },
    scoringPlay: opts.scoring ?? false,
    team: opts.team ? { id: opts.team, displayName: opts.team === '384' ? 'Crystal Palace' : 'Manchester City' } : undefined,
    participants: (opts.players ?? []).map(name => ({ athlete: { displayName: name } })),
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    header: {
      id: '735531',
      season: { name: '2024-25 English FA Cup, Final' },
      competitions: [{
        date: '2025-05-17T15:30Z',
        status: { type: { state: 'post', completed: true, description: 'Full Time', detail: 'FT' } },
        // Away listed first on purpose: never assume home-first ordering.
        competitors: [
          { id: '382', homeAway: 'away', score: '0', winner: false, team: { id: '382', displayName: 'Manchester City', abbreviation: 'MNC', color: '99c5ea', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/382.png' }] } },
          { id: '384', homeAway: 'home', score: '1', winner: true, team: { id: '384', displayName: 'Crystal Palace', abbreviation: 'CRY', color: '0202fb' } },
        ],
      }],
    },
    gameInfo: { venue: { fullName: 'Wembley Stadium' }, attendance: 84163, officials: [{ displayName: 'Stuart Attwell' }] },
    keyEvents: [
      keyEvent('kickoff', 'First Half begins.'),
      keyEvent('goal---volley', 'Goal! Crystal Palace 1, Manchester City 0. Eberechi Eze (Crystal Palace) right footed shot. Assisted by Daniel Muñoz with a cross.', { clock: "16'", team: '384', players: ['Eberechi Eze', 'Daniel Muñoz'], scoring: true, typeText: 'Goal - Volley' }),
      keyEvent('penalty---saved', 'Penalty saved. Omar Marmoush (Manchester City) right footed shot saved.', { clock: "36'", team: '382', players: ['Omar Marmoush'], typeText: 'Penalty - Saved' }),
      keyEvent('halftime', 'First Half ends, Crystal Palace 1, Manchester City 0.', { clock: "45'+4'" }),
      keyEvent('substitution', 'Substitution, Crystal Palace. Jefferson Lerma replaces Marc Guéhi because of an injury.', { clock: "61'", period: 2, team: '384', players: [] }),
      keyEvent('own-goal', 'Own Goal by Rúben Dias, Manchester City. Crystal Palace 2, Manchester City 0.', { clock: "70'", period: 2, team: '384', players: ['Rúben Dias'], scoring: true, typeText: 'Own Goal' }),
      keyEvent('yellow-red-card', 'Second yellow card to Bernardo Silva (Manchester City).', { clock: "90'+1'", period: 2, team: '382', players: ['Bernardo Silva'], typeText: 'Yellow-Red Card' }),
      keyEvent('penalty---scored', 'Goal! Crystal Palace 2, Manchester City 1. Erling Haaland converts the penalty.', { clock: "90'+3'", period: 2, team: '382', players: ['Erling Haaland'], scoring: true, typeText: 'Penalty - Scored' }),
      keyEvent('end-regular-time', 'Match ends.', { period: 2 }),
    ],
    boxscore: { teams: [
      { homeAway: 'home', team: { id: '384' }, statistics: [{ name: 'possessionPct', displayValue: '38.5' }, { name: 'totalShots', displayValue: '7' }, { name: 'passPct', displayValue: '0.71' }, { name: 'blockedShots', displayValue: '3' }] },
      { homeAway: 'away', team: { id: '382' }, statistics: [{ name: 'possessionPct', displayValue: '61.5' }, { name: 'totalShots', displayValue: '19' }, { name: 'passPct', displayValue: '0.89' }] },
    ] },
    rosters: [
      { homeAway: 'home', formation: '3-4-2-1', roster: [
        { starter: true, jersey: '1', position: { abbreviation: 'G' }, athlete: { id: '1', displayName: 'Dean Henderson', links: [], jerseyImages: [] }, plays: [{}] },
        { starter: false, jersey: '25', position: { abbreviation: 'SUB' }, subbedIn: true, athlete: { displayName: 'Ben Chilwell' } },
      ] },
      { homeAway: 'away', formation: '4-3-3', roster: [{ starter: true, jersey: '31', athlete: { displayName: 'Ederson' } }] },
    ],
    commentary: [
      { sequence: 2, time: { displayValue: "2'" }, text: 'Second line.' },
      { sequence: 1, time: { displayValue: "1'" }, text: 'First line.', play: { participants: [{}] } },
    ],
    ...overrides,
  };
}

test('clock labels parse minute and stoppage time', () => {
  assert.deepEqual(parseEspnClock("45'+4'"), { minute: 45, extra_minute: 4 });
  assert.deepEqual(parseEspnClock("16'"), { minute: 16, extra_minute: null });
  assert.equal(parseEspnClock(''), null);
  assert.equal(parseEspnClock(null), null);
});

test('ESPN event vocabulary maps to timeline kinds', () => {
  assert.equal(classifyEspnEvent('goal---header', 'Goal - Header', true), 'goal');
  assert.equal(classifyEspnEvent('own-goal', 'Own Goal', true), 'own-goal');
  assert.equal(classifyEspnEvent('penalty---scored', 'Penalty - Scored', true), 'penalty-goal');
  assert.equal(classifyEspnEvent('penalty---missed', 'Penalty - Missed', false), 'penalty-missed');
  assert.equal(classifyEspnEvent('yellow-card', 'Yellow Card', false), 'yellow-card');
  assert.equal(classifyEspnEvent('red-card', 'Red Card', false), 'red-card');
  assert.equal(classifyEspnEvent('yellow-red-card', 'Yellow-Red Card', false), 'red-card');
  assert.equal(classifyEspnEvent('substitution', 'Substitution', false), 'substitution');
  assert.equal(classifyEspnEvent('start-delay', 'Start Delay', false), 'period');
  assert.equal(classifyEspnEvent('end-match', 'End Match', false), 'period');
});

test('header, sides, facts, lineups and commentary normalize; away-first ordering is respected', () => {
  const d = normalizeEspnMatch(summary(), ctx);
  assert.equal(d.home.name, 'Crystal Palace');
  assert.equal(d.away.name, 'Manchester City');
  assert.deepEqual([d.home.score, d.away.score, d.home.winner], [1, 0, true]);
  assert.equal(d.home.color, '#0202fb');
  assert.equal(d.home.logo_url, 'https://a.espncdn.com/i/teamlogos/soccer/500/384.png');
  assert.equal(d.away.logo_url, 'https://a.espncdn.com/i/teamlogos/soccer/500/382.png');
  assert.equal(d.kickoff_at, '2025-05-17T15:30:00.000Z');
  assert.deepEqual([d.status.state, d.status.completed, d.status.detail], ['post', true, 'FT']);
  assert.deepEqual([d.venue, d.attendance, d.referee], ['Wembley Stadium', 84163, 'Stuart Attwell']);
  assert.equal(d.season_name, '2024-25 English FA Cup, Final');
  // Team stats: percentages normalized to 0–100, unmapped stats kept raw.
  assert.deepEqual([d.facts?.home.possession, d.facts?.home.shots, d.facts?.home.pass_accuracy, d.facts?.away.pass_accuracy], [38.5, 7, 71, 89]);
  assert.equal(d.facts?.home.raw_stats.blockedShots, 3);
  assert.equal(d.facts?.home.corners, null);
  // Lineups split starters from bench; formation retained.
  assert.equal(d.lineups?.home.formation, '3-4-2-1');
  assert.deepEqual(d.lineups?.home.starters.map(p => p.name), ['Dean Henderson']);
  assert.deepEqual(d.lineups?.home.bench.map(p => [p.name, p.subbed_in]), [['Ben Chilwell', true]]);
  // Commentary ordered by sequence.
  assert.deepEqual(d.commentary.map(c => c.text), ['First line.', 'Second line.']);
});

test('timeline keeps every ESPN event; share-card events use fixture_events spellings', () => {
  const d = normalizeEspnMatch(summary(), ctx);
  assert.equal(d.timeline.length, 9);
  const kinds = d.timeline.map(t => t.kind);
  assert.deepEqual(kinds, ['period', 'goal', 'penalty-missed', 'period', 'substitution', 'own-goal', 'red-card', 'penalty-goal', 'period']);
  const goal = d.timeline[1]!;
  assert.deepEqual([goal.side, goal.player, goal.secondary, goal.minute], ['home', 'Eberechi Eze', 'Daniel Muñoz', 16]);
  const half = d.timeline[3]!;
  assert.deepEqual([half.minute, half.extra_minute, half.side], [45, 4, null]);
  // Substitution text is parsed when ESPN sends no participants: "X replaces
  // Y because …" → X on, Y off, reason dropped.
  const sub = d.timeline[4]!;
  assert.deepEqual([sub.player, sub.secondary], ['Jefferson Lerma', 'Marc Guéhi']);
  // Participants win over the text when present ([on, off]).
  const withParts = normalizeEspnMatch(summary({ keyEvents: [keyEvent('substitution', 'Substitution, Crystal Palace. Álex Jiménez replaces Marc Guéhi.', { clock: "61'", team: '384', players: ['Alejandro Jiménez', 'Marc Guéhi'] })] }), ctx);
  assert.deepEqual([withParts.timeline[0]!.player, withParts.timeline[0]!.secondary], ['Alejandro Jiménez', 'Marc Guéhi']);

  const events = d.events;
  assert.deepEqual(events.map(e => [e.type, e.detail]), [
    ['goal', 'Normal Goal'], ['var', 'Missed Penalty'], ['subst', 'Substitution'],
    ['goal', 'Own Goal'], ['card', 'Second Yellow card'], ['goal', 'Penalty'],
  ]);
  // fixture_events convention: subs carry the player going OFF in player_name
  // and the player coming ON in assist_name.
  const subRow = events[2]!;
  assert.deepEqual([subRow.player_name, subRow.assist_name, subRow.side, subRow.minute], ['Marc Guéhi', 'Jefferson Lerma', 'home', 61]);
  // Own goals keep ESPN's side (the team credited with the goal).
  assert.deepEqual([events[3]!.side, events[3]!.player_name, events[3]!.assist_name], ['home', 'Rúben Dias', null]);
  assert.deepEqual([events[4]!.minute, events[4]!.extra_minute], [90, 1]);
  assert.ok(events.every(e => e.fixture_id === '735531' && e.team_id === null && e.id.startsWith('espn-')));

  assert.deepEqual(d.derived.home, { goals: 2, yellow_cards: 0, red_cards: 0, substitutions: 1, penalties_scored: 0, penalties_missed: 0 });
  assert.deepEqual(d.derived.away, { goals: 1, yellow_cards: 0, red_cards: 1, substitutions: 0, penalties_scored: 1, penalties_missed: 1 });
});

test('missing optional sections degrade to nulls instead of failing', () => {
  const d = normalizeEspnMatch(summary({ keyEvents: undefined, boxscore: { teams: [{ homeAway: 'home' }, { homeAway: 'away' }] }, rosters: [], commentary: [], gameInfo: {} }), ctx);
  assert.deepEqual([d.timeline, d.events, d.facts, d.lineups, d.commentary], [[], [], null, null, []]);
  assert.deepEqual([d.venue, d.attendance, d.referee], [null, null, null]);
  assert.equal(timelineToEvents('1', []).length, 0);
});

test('a payload for a different event or with one side is rejected', () => {
  assert.throws(() => normalizeEspnMatch(summary(), { ...ctx, eventId: '1' }), /expected 1/);
  const s = summary();
  (s.header.competitions[0] as { competitors: unknown[] }).competitors.pop();
  assert.throws(() => normalizeEspnMatch(s, ctx), /missing home or away/);
});

test('slimmed audit payload drops player media and per-play blobs', () => {
  const slim = slimEspnSummary(summary({ news: { big: 'x'.repeat(1000) }, videos: [] })) as Record<string, unknown>;
  assert.deepEqual(Object.keys(slim).sort(), ['boxscore', 'commentary', 'gameInfo', 'header', 'keyEvents', 'rosters']);
  const text = JSON.stringify(slim);
  assert.ok(!text.includes('jerseyImages') && !text.includes('"plays"') && !text.includes('participants":[{}]'));
});

test('team logo prefers the default variant, then any non-dark one, over array order', () => {
  const withLogos = (logos: unknown[]) => {
    const s = summary();
    const competitors = (s.header.competitions[0] as { competitors: { team: Record<string, unknown> }[] }).competitors;
    competitors[1]!.team = { ...competitors[1]!.team, logos };
    return normalizeEspnMatch(s, ctx);
  };
  // Dark listed first (as ESPN does for some cups): the default wins.
  assert.equal(withLogos([
    { href: 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/384.png', rel: ['full', 'dark'] },
    { href: 'https://a.espncdn.com/i/teamlogos/soccer/500/384.png', rel: ['full', 'default'] },
  ]).home.logo_url, 'https://a.espncdn.com/i/teamlogos/soccer/500/384.png');
  // No default tagged: the first non-dark one.
  assert.equal(withLogos([
    { href: 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/384.png', rel: ['full', 'dark'] },
    { href: 'https://a.espncdn.com/i/teamlogos/soccer/500/384.png', rel: ['full', 'scoreboard'] },
  ]).home.logo_url, 'https://a.espncdn.com/i/teamlogos/soccer/500/384.png');
  // Only a dark variant exists: still better than nothing.
  assert.equal(withLogos([
    { href: 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/384.png', rel: ['full', 'dark'] },
  ]).home.logo_url, 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/384.png');
  // No logos at all: the flat `logo` field, then the CDN by id.
  assert.equal(withLogos([]).home.logo_url, 'https://a.espncdn.com/i/teamlogos/soccer/500/384.png');
});
