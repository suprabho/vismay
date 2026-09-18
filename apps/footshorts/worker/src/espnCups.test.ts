import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ESPN_CUPS, fetchEspnCup, normalizeCupEvent } from '@footshorts/shared/espnCups';

const cup = ESPN_CUPS[2];
const fetchedAt = '2026-09-17T12:00:00Z';
function event(overrides: Record<string, unknown> = {}) {
  return {
    id: '123', date: '2026-04-18T19:00Z', season: { year: 2025, slug: 'final' },
    competitions: [{
      date: '2026-04-18T19:00Z', timeValid: true,
      status: { type: { name: 'STATUS_FINAL_PEN', state: 'post', completed: true, description: 'After penalties' } },
      // Away first: never assume the source orders competitors home-first.
      competitors: [
        { homeAway: 'away', team: { id: '89', displayName: 'Real Sociedad' }, score: '2', shootoutScore: 4, winner: true },
        { homeAway: 'home', team: { id: '1068', displayName: 'Atlético Madrid' }, score: '2', shootoutScore: 3, winner: false },
      ],
    }], ...overrides,
  };
}

test('spring cup final retains the campaign, side identity and separate shootout result', () => {
  const row = normalizeCupEvent(event(), cup, fetchedAt);
  assert.equal(row.season_start, 2025);
  assert.equal(row.home_team_name, 'Atlético Madrid');
  assert.equal(row.away_team_name, 'Real Sociedad');
  assert.deepEqual([row.home_score, row.away_score, row.home_penalties, row.away_penalties], [2, 2, 3, 4]);
  assert.equal(row.winner_espn_id, '89');
  assert.equal(row.status, 'finished');
});

test('unplayed zero placeholders do not become results; unconfirmed kickoffs stay unconfirmed', () => {
  const e = event();
  const match = e.competitions[0]!;
  match.status.type = { name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled' };
  match.timeValid = false;
  const row = normalizeCupEvent(e, cup, fetchedAt);
  assert.deepEqual([row.home_score, row.away_score, row.home_penalties, row.away_penalties, row.winner_espn_id], [null, null, null, null, null]);
  assert.equal(row.kickoff_time_confirmed, false);
});

test('extra time and active shootouts are live; postponed and suspended retain their state', () => {
  for (const [name, state, expected] of [
    ['STATUS_EXTRA_TIME', 'in', 'live'], ['STATUS_PENALTY_SHOOTOUT', 'in', 'live'],
    ['STATUS_POSTPONED', 'pre', 'postponed'], ['STATUS_SUSPENDED', 'in', 'suspended'],
    ['STATUS_CANCELED', 'post', 'cancelled'],
  ]) {
    const e = event();
    e.competitions[0]!.status.type = { name: name!, state: state!, completed: false, description: name! };
    assert.equal(normalizeCupEvent(e, cup, fetchedAt).status, expected);
  }
});

test('missing and invalid scores remain null instead of zero', () => {
  const e = event();
  const match = e.competitions[0]!;
  const broken = { ...match, competitors: match.competitors.map(c => ({ ...c, score: undefined, shootoutScore: '' })) };
  const row = normalizeCupEvent({ ...e, competitions: [broken] }, cup, fetchedAt);
  assert.equal(row.home_score, null);
  assert.equal(row.away_penalties, null);
});

test('malformed events fail rather than saving a fixture with the wrong identity', () => {
  assert.throws(() => normalizeCupEvent(event({ season: null }), cup, fetchedAt), /season/);
  assert.throws(() => normalizeCupEvent(event({ id: '../../anything' }), cup, fetchedAt), /ID/);
  assert.throws(() => normalizeCupEvent(event({ competitions: [] }), cup, fetchedAt), /one match/);
});

function response(events: unknown[], slug: string = cup.code) {
  return new Response(JSON.stringify({ leagues: [{ slug }], events }), { status: 200 });
}

test('two calendar years select only the requested campaign and deduplicate matches', async () => {
  const requested: string[] = [];
  const fetcher: typeof fetch = async input => {
    requested.push(String(input));
    return response([event(), event({ id: '456', season: { year: 2026, slug: 'first-round' } })]);
  };
  const rows = await fetchEspnCup(cup, 2025, fetcher);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.espn_event_id, '123');
  assert.ok(requested.some(u => u.includes('dates=2025')));
  assert.ok(requested.some(u => u.includes('dates=2026')));
});

test('empty coverage is valid; upstream failures, wrong leagues and truncated results are not', async () => {
  assert.deepEqual(await fetchEspnCup(cup, 2025, async () => response([])), []);
  await assert.rejects(fetchEspnCup(cup, 2025, async () => new Response('{}', { status: 403 })), /HTTP 403/);
  await assert.rejects(fetchEspnCup(cup, 2025, async () => new Response('{}')), /missing events/);
  await assert.rejects(fetchEspnCup(cup, 2025, async () => response([], 'eng.fa')), /unexpected competition/);
  await assert.rejects(fetchEspnCup(cup, 2025, async () => response(Array.from({ length: 1000 }, () => event()))), /truncated/);
});
