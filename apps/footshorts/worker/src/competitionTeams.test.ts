import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { shortNameAlias, topUpCompetitionTeams, type FdTeam } from './competitionTeams';
import { fakeSupabase } from './fakeSupabase';

const LALIGA = { id: 'league-pd', slug: 'primera-division', domestic: true };
const UCL = { id: 'league-cl', slug: 'champions-league', domestic: false };

const RACING: FdTeam = {
  id: 1100,
  name: 'Real Racing Club de Santander',
  shortName: 'Racing Santander',
  crest: 'https://crests.football-data.org/1100.png',
  area: { name: 'Spain' },
};

test('shortNameAlias: keeps names that add a match, drops redundant and generic ones', () => {
  assert.deepEqual(shortNameAlias(RACING), { alias_slug: 'racing-santander', alias_label: 'Racing Santander' });
  assert.equal(shortNameAlias({ id: 1, name: 'Sevilla FC', shortName: 'Sevilla' }), null); // == slug
  assert.equal(shortNameAlias({ id: 2, name: 'Athletic Club', shortName: 'Athletic' }), null); // generic
  assert.equal(shortNameAlias({ id: 3, name: 'Real Betis Balompié', shortName: null }), null);
});

test('a promoted club gets a row, membership and its short name', async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    entities: [{ id: 'sev', type: 'team', slug: 'sevilla', name: 'Sevilla FC', football_data_id: 559 }],
    team_competitions: [],
    entity_aliases: [],
  };
  const index = new Map([[559, 'sev']]);
  const result = await topUpCompetitionTeams(
    fakeSupabase(tables),
    LALIGA,
    [{ id: 559, name: 'Sevilla FC', shortName: 'Sevilla' }, RACING],
    index,
  );

  assert.deepEqual(result.inserted, ['Real Racing Club de Santander']);
  const racing = tables.entities!.find((e) => e.football_data_id === 1100)!;
  assert.equal(racing.slug, 'real-racing-club-de-santander');
  assert.equal(racing.league_slug, 'primera-division');
  assert.equal(racing.country, 'Spain');
  assert.equal(index.get(1100), racing.id, 'fixtures in the same run link to the new row');
  assert.deepEqual(
    tables.team_competitions!.map((m) => m.team_id).sort(),
    ['sev', racing.id as string].sort(),
  );
  assert.deepEqual(tables.entity_aliases!.map((a) => a.alias_slug), ['racing-santander']);
});

test('cups record membership but never set league_slug', async () => {
  const tables: Record<string, Record<string, unknown>[]> = { entities: [], team_competitions: [], entity_aliases: [] };
  await topUpCompetitionTeams(
    fakeSupabase(tables),
    UCL,
    [{ id: 851, name: 'Club Brugge KV', area: { name: 'Belgium' } }],
    new Map(),
  );
  assert.equal(tables.entities![0]!.league_slug, null);
  assert.equal(tables.team_competitions!.length, 1);
});

test('an unlinked row at the same slug is claimed, not duplicated', async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    entities: [{ id: 'hand', type: 'team', slug: 'real-racing-club-de-santander', name: 'Racing', football_data_id: null }],
    team_competitions: [],
    entity_aliases: [],
  };
  const result = await topUpCompetitionTeams(fakeSupabase(tables), LALIGA, [RACING], new Map());
  assert.deepEqual(result.claimed, ['Real Racing Club de Santander']);
  assert.equal(tables.entities!.length, 1);
  assert.equal(tables.entities![0]!.football_data_id, 1100);
});

test('a slug owned by another football-data id is skipped, not overwritten', async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    entities: [{ id: 'other', type: 'team', slug: 'real-racing-club-de-santander', name: 'X', football_data_id: 9 }],
    team_competitions: [],
    entity_aliases: [],
  };
  const result = await topUpCompetitionTeams(fakeSupabase(tables), LALIGA, [RACING], new Map());
  assert.equal(result.collisions.length, 1);
  assert.equal(tables.entities!.length, 1);
  assert.equal(tables.entities![0]!.football_data_id, 9);
  assert.equal(tables.team_competitions!.length, 0);
});

test('an editor\'s alias is never overwritten by a short name', async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    entities: [],
    team_competitions: [],
    entity_aliases: [{ entity_type: 'team', alias_slug: 'racing-santander', alias_label: 'Racing Santander', entity_id: 'editor-pick' }],
  };
  await topUpCompetitionTeams(fakeSupabase(tables), LALIGA, [RACING], new Map());
  assert.equal(tables.entity_aliases!.length, 1);
  assert.equal(tables.entity_aliases![0]!.entity_id, 'editor-pick');
});
