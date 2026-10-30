import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ESPN_CUPS } from '@footshorts/shared/espnCups';
import { classifyEspnEvent, fixturePatchFromDetail, normalizeEspnMatch, parseEspnClock, slimEspnSummary, timelineToEvents } from '@footshorts/shared/espnMatch';

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

function shootoutSummary(extra: { keyEvents?: unknown[]; commentary?: unknown[] }) {
  const s = summary(extra);
  const comp = s.header.competitions[0] as Record<string, unknown> & { competitors: Record<string, unknown>[] };
  comp.status = { type: { name: 'STATUS_FINAL_PEN', state: 'post', completed: true, description: 'Final', detail: 'FT-Pens' } };
  // competitors[0] is the away side (Manchester City), [1] the home side.
  comp.competitors[0] = { ...comp.competitors[0], score: '1', shootoutScore: '3', winner: false };
  comp.competitors[1] = { ...comp.competitors[1], score: '1', shootoutScore: '4', winner: true };
  return s;
}

test('shootout kicks come from the commentary and stay out of the timeline', () => {
  const d = normalizeEspnMatch(shootoutSummary({ commentary: [
    { sequence: 100, time: { displayValue: "90'+5'" }, text: 'Second Half ends, Crystal Palace 1, Manchester City 1.' },
    { sequence: 101, time: { displayValue: '' }, text: 'Penalty Shootout begins Crystal Palace 1, Manchester City 1.' },
    { sequence: 102, time: { displayValue: '' }, text: 'Goal! Crystal Palace 1(1), Manchester City 1. Eberechi Eze (Crystal Palace) converts the penalty with a right footed shot to the bottom left corner.' },
    { sequence: 103, time: { displayValue: '' }, text: 'Penalty saved! Erling Haaland (Manchester City) fails to capitalise on this great opportunity, left footed shot saved in the centre of the goal.' },
    { sequence: 104, time: { displayValue: '' }, text: 'Penalty missed! Bad penalty by Jean-Philippe Mateta (Crystal Palace) right footed shot goes high.' },
    { sequence: 105, time: { displayValue: '' }, text: 'Penalty Shootout ends, Crystal Palace 1(4), Manchester City 1(3).' },
    { sequence: 106, time: { displayValue: '' }, text: 'Goal! Not part of the shootout (Nobody).' },
  ] }), ctx);
  assert.deepEqual(d.shootout?.map(k => [k.order, k.side, k.player, k.result]), [
    [1, 'home', 'Eberechi Eze', 'scored'],
    [2, 'away', 'Erling Haaland', 'saved'],
    [3, 'home', 'Jean-Philippe Mateta', 'missed'],
  ]);
  assert.equal(d.status.name, 'STATUS_FINAL_PEN');
  assert.deepEqual(fixturePatchFromDetail(d), {
    status: 'finished', status_detail: 'Final', home_score: 1, away_score: 1, home_penalties: 4, away_penalties: 3,
    winner_espn_id: '384', kickoff_at: '2025-05-17T15:30:00.000Z',
  });
});

test('shootout key events (period 5) are kicks, not goals', () => {
  const d = normalizeEspnMatch(shootoutSummary({ keyEvents: [
    keyEvent('penalty---scored', 'Goal! Eze converts.', { clock: "120'", period: 5, team: '384', players: ['Eberechi Eze'], scoring: true, typeText: 'Penalty - Scored' }),
    keyEvent('penalty---saved', 'Penalty saved. Haaland.', { clock: "120'", period: 5, team: '382', players: ['Erling Haaland'], typeText: 'Penalty - Saved' }),
  ] }), ctx);
  assert.equal(d.timeline.length, 0);
  assert.equal(d.events.length, 0);
  assert.equal(d.derived.home.goals, 0);
  assert.deepEqual(d.shootout?.map(k => [k.side, k.player, k.result]), [['home', 'Eberechi Eze', 'scored'], ['away', 'Erling Haaland', 'saved']]);
});

test('an unplayed match patches no score', () => {
  const s = summary();
  (s.header.competitions[0] as Record<string, unknown>).status = { type: { state: 'pre', completed: false, description: 'Scheduled' } };
  const patch = fixturePatchFromDetail(normalizeEspnMatch(s, ctx));
  assert.equal(patch.status, 'scheduled');
  assert.equal(patch.home_score, null);
});

// Liverpool 1–1 Chelsea, Carabao Cup fourth round 2026/27 (ESPN 401921842):
// Liverpool advance 6–5 on penalties after eight rounds, as ESPN's shootout card shows it.
const LIV_KICKS: [string, string][] = [['A. Mac Allister', 'Scored'], ['A. Isak', 'Scored'], ['C. Gakpo', 'Scored'], ['F. Wirtz', 'Scored'], ['K. Tsimikas', 'Missed'], ['B. Barcola', 'Scored'], ['R. Gravenberch', 'Saved'], ['J. Gomez', 'Scored']];
const CHE_KICKS: [string, string][] = [['P. Neto', 'Scored'], ['M. Rogers', 'Scored'], ['R. Lavia', 'Scored'], ['V. Barco', 'Missed'], ['J. Henderson', 'Scored'], ['L. Colwill', 'Scored'], ['E. Emegha', 'Saved'], ['W. Fofana', 'Missed']];

function liverpoolChelsea(shape: 'competitor' | 'top-level') {
  const shots = (kicks: [string, string][]) => kicks.map(([name, result], i) => ({
    shotNumber: i + 1, didScore: result === 'Scored', athlete: { displayName: name }, result: { text: result },
  }));
  const liv = { id: '364', homeAway: 'home', score: '1', shootoutScore: '6', winner: true, team: { id: '364', displayName: 'Liverpool' } };
  const che = { id: '363', homeAway: 'away', score: '1', shootoutScore: '5', winner: false, team: { id: '363', displayName: 'Chelsea' } };
  return {
    header: { id: '401921842', competitions: [{
      date: '2026-10-27T20:00Z',
      status: { type: { name: 'STATUS_FINAL_PEN', state: 'post', completed: true, description: 'Final', detail: 'FT-Pens' } },
      notes: [{ type: 'event', headline: 'Liverpool advances 6-5 on penalties' }],
      competitors: shape === 'competitor'
        ? [{ ...liv, shootout: shots(LIV_KICKS) }, { ...che, shootout: shots(CHE_KICKS) }]
        : [liv, che],
    }] },
    ...(shape === 'top-level' ? { shootout: [
      { team: { id: '363', displayName: 'Chelsea' }, shots: shots(CHE_KICKS) },
      { team: { id: '364', displayName: 'Liverpool' }, shots: shots(LIV_KICKS) },
    ] } : {}),
    keyEvents: [],
    commentary: [],
  };
}

test("ESPN's shootout card data: kicks paired by round, home first", () => {
  for (const shape of ['competitor', 'top-level'] as const) {
    const d = normalizeEspnMatch(liverpoolChelsea(shape), { ...ctx, eventId: '401921842' });
    assert.equal(d.shootout?.length, 16, shape);
    assert.deepEqual(d.shootout?.slice(0, 2).map(k => [k.round, k.side, k.player, k.result]), [[1, 'home', 'A. Mac Allister', 'scored'], [1, 'away', 'P. Neto', 'scored']], shape);
    assert.deepEqual(d.shootout?.filter(k => k.round === 7).map(k => k.result), ['saved', 'saved'], shape);
    assert.equal(d.shootout?.filter(k => k.side === 'home' && k.result === 'scored').length, 6, shape);
    assert.equal(d.shootout?.filter(k => k.side === 'away' && k.result === 'scored').length, 5, shape);
    const patch = fixturePatchFromDetail(d);
    assert.deepEqual([patch.status, patch.home_score, patch.away_score, patch.home_penalties, patch.away_penalties, patch.winner_espn_id], ['finished', 1, 1, 6, 5, '364']);
    assert.deepEqual(patch.notes, ['Liverpool advances 6-5 on penalties']);
  }
  // The audit payload keeps the shootout.
  assert.ok((slimEspnSummary(liverpoolChelsea('top-level')) as Record<string, unknown>).shootout);
});
