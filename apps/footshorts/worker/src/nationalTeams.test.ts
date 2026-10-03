import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ENTITY_ALIASES, normalizeEntityKey } from '@footshorts/shared/entityKeys';
import { NATIONAL_TEAMS, nationalTeamFlagUrl } from '@footshorts/shared/nationalTeams';
import { clearEntityCache, resolveEntitiesDetailed } from './entityResolver';
import { findNationalTeams } from './nationalTeamMatch';

const MIGRATION = new URL(
  '../../../../supabase/footshorts/migrations/20261001000000_national_team_entities.sql',
  import.meta.url,
);

test('covers all 211 FIFA members with unique codes, slugs and flags', () => {
  assert.equal(NATIONAL_TEAMS.length, 211);
  const perConfed: Record<string, number> = {};
  for (const t of NATIONAL_TEAMS) perConfed[t.confederation] = (perConfed[t.confederation] ?? 0) + 1;
  assert.deepEqual(perConfed, { AFC: 46, CAF: 54, CONCACAF: 35, CONMEBOL: 10, OFC: 11, UEFA: 55 });

  for (const key of ['fifaCode', 'slug', 'flag'] as const) {
    const values = NATIONAL_TEAMS.map((t) => t[key]);
    assert.equal(new Set(values).size, values.length, `duplicate ${key}`);
  }
  for (const t of NATIONAL_TEAMS) {
    assert.match(t.fifaCode, /^[A-Z]{3}$/, t.name);
    assert.match(t.flag, /^([a-z]{2}|gb-(eng|sct|wls|nir))$/, t.name);
  }
});

test('slug is the resolver key of the name, and aliases are in key form', () => {
  const slugs = new Set(NATIONAL_TEAMS.map((t) => t.slug));
  for (const t of NATIONAL_TEAMS) {
    assert.equal(t.slug, normalizeEntityKey(t.name), t.name);
    for (const a of t.aliases ?? []) {
      assert.equal(a, normalizeEntityKey(a), `${t.name} alias ${a}`);
      assert.ok(!slugs.has(a), `${t.name} alias ${a} shadows a team slug`);
      assert.equal(ENTITY_ALIASES[a], t.slug, `${a} missing from ENTITY_ALIASES`);
    }
  }
});

test('migration inserts exactly the shared list', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const rows = [...sql.matchAll(/^\s+\('([^']+)', '((?:[^']|'')+)', '([A-Z]{3})', '([^']+)'\),?$/gm)].map(
    ([, slug, name = '', code, crest]) => ({ slug, name: name.replace(/''/g, "'"), code, crest }),
  );
  assert.deepEqual(
    rows,
    NATIONAL_TEAMS.map((t) => ({ slug: t.slug, name: t.name, code: t.fifaCode, crest: nationalTeamFlagUrl(t) })),
  );
});

test('findNationalTeams: the headline that started this', () => {
  assert.deepEqual(
    findNationalTeams('Lautaro Martinez matches Aguero to become Argentina’s third all-time top scorer'),
    ['argentina'],
  );
  assert.deepEqual(findNationalTeams('Argentina 4-0 Bolivia: Messi rested'), ['argentina', 'bolivia']);
});

test('findNationalTeams: aliases, accents and case', () => {
  assert.deepEqual(findNationalTeams("Côte d'Ivoire stun Korea Republic"), ['ivory-coast', 'south-korea']);
  assert.deepEqual(findNationalTeams('USA and Türkiye draw'), ['united-states', 'turkey']);
  assert.deepEqual(findNationalTeams('HOLLAND recall Depay'), ['netherlands']);
});

test('findNationalTeams: longest name wins', () => {
  assert.deepEqual(findNationalTeams('Papua New Guinea beat Samoa'), ['papua-new-guinea', 'samoa']);
  assert.deepEqual(findNationalTeams('Guinea-Bissau v Equatorial Guinea'), ['guinea-bissau', 'equatorial-guinea']);
  assert.deepEqual(findNationalTeams('DR Congo edge Congo'), ['dr-congo', 'congo']);
  assert.deepEqual(findNationalTeams('Northern Ireland boss on Ireland game'), ['northern-ireland', 'republic-of-ireland']);
  assert.deepEqual(findNationalTeams('South Sudan and American Samoa'), ['south-sudan', 'american-samoa']);
});

test('findNationalTeams: skips other sides, ambiguous names and look-alike phrases', () => {
  assert.deepEqual(findNationalTeams('England Women win again'), []);
  assert.deepEqual(findNationalTeams("Spain U-21 and England's U21s"), []);
  assert.deepEqual(findNationalTeams('Brazil U20 squad named'), []);
  assert.deepEqual(findNationalTeams('Jordan Pickford saves penalty'), []);
  assert.deepEqual(findNationalTeams('New England Revolution sign striker'), []);
  assert.deepEqual(findNationalTeams('Nigeria and Niger'), ['nigeria', 'niger']);
  assert.deepEqual(findNationalTeams('Arsenal beat Chelsea'), []);
});

/** Just enough of a Supabase client for the resolver's two cache loads. */
function fakeSupabase(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from: (table: string) => ({ select: async () => ({ data: tables[table] ?? [], error: null }) }),
  } as unknown as SupabaseClient;
}

test('resolver tags national teams by name, slug and alias once the rows exist', async () => {
  clearEntityCache();
  const supabase = fakeSupabase({
    entities: NATIONAL_TEAMS.map((t) => ({ id: `id-${t.fifaCode}`, name: t.name, slug: t.slug, type: 'team' })),
    entity_aliases: [],
  });
  const resolved = await resolveEntitiesDetailed(supabase, {
    leagues: [],
    teams: ['Argentina', 'Bolivia', 'Korea Republic', "Côte d'Ivoire", 'USA', 'Republic of Ireland'],
    players: [],
  });
  clearEntityCache();
  assert.deepEqual(
    resolved.map((e) => e.id),
    ['id-ARG', 'id-BOL', 'id-KOR', 'id-CIV', 'id-USA', 'id-IRL'],
  );
});
