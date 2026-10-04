import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clearEntityCache, resolveEntitiesDetailed, type ResolveContext } from './entityResolver';
import { fakeSupabase } from './fakeSupabase';

// Team rows as seed.ts / the fixtures top-up store them: official
// football-data names, slugs from teamSlug.ts.
const TEAMS = [
  { id: 'rma', name: 'Real Madrid CF', slug: 'real-madrid', country: 'Spain' },
  { id: 'atm', name: 'Club Atlético de Madrid', slug: 'club-atletico-de-madrid', country: 'Spain' },
  { id: 'ray', name: 'Rayo Vallecano de Madrid', slug: 'rayo-vallecano-de-madrid', country: 'Spain' },
  { id: 'rso', name: 'Real Sociedad de Fútbol', slug: 'real-sociedad-de-futbol', country: 'Spain' },
  { id: 'rac', name: 'Real Racing Club de Santander', slug: 'real-racing-club-de-santander', country: 'Spain' },
  { id: 'cel', name: 'RC Celta de Vigo', slug: 'celta-de-vigo', country: 'Spain' },
  { id: 'esp', name: 'RCD Espanyol de Barcelona', slug: 'espanyol-de-barcelona', country: 'Spain' },
  { id: 'vil', name: 'Villarreal CF', slug: 'villarreal', country: 'Spain' },
  { id: 'len', name: 'Racing Club de Lens', slug: 'racing-club-de-lens', country: 'France' },
  { id: 'mun', name: 'Manchester United FC', slug: 'manchester-united', country: 'England' },
  { id: 'mci', name: 'Manchester City FC', slug: 'manchester-city', country: 'England' },
].map((t) => ({ ...t, type: 'team' }));

async function resolveTeams(teams: string[], context: ResolveContext = {}): Promise<string[]> {
  clearEntityCache();
  const supabase = fakeSupabase({ entities: TEAMS.map((t) => ({ ...t })), entity_aliases: [] });
  const resolved = await resolveEntitiesDetailed(supabase, { leagues: [], teams, players: [] }, context);
  clearEntityCache();
  return resolved.map((e) => e.id);
}

test('short press names reach official football-data names', async () => {
  assert.deepEqual(
    await resolveTeams(['Real Sociedad', 'Racing Santander', 'Celta', 'Espanyol', 'Rayo Vallecano']),
    ['rso', 'rac', 'cel', 'esp', 'ray'],
  );
});

test('bare "Racing" is Racing Santander in a Spanish outlet, a miss elsewhere', async () => {
  assert.deepEqual(await resolveTeams(['Racing'], { country: 'ES' }), ['rac']);
  assert.deepEqual(await resolveTeams(['Racing']), []);
});

test('ambiguous words stay misses, even with a country', async () => {
  assert.deepEqual(await resolveTeams(['Madrid'], { country: 'ES' }), []);
  assert.deepEqual(await resolveTeams(['Manchester']), []);
});

test('reserve and women\'s sides never land on the first team', async () => {
  assert.deepEqual(await resolveTeams(['Villarreal B', 'Real Madrid Castilla', 'Real Madrid Femenino']), []);
});

test('exact names still win before word matching', async () => {
  assert.deepEqual(await resolveTeams(['Real Madrid', 'Villarreal', 'Manchester City']), ['rma', 'vil', 'mci']);
});
