import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, norm, resolveWithIndex, type PersonRow, type TeamRow } from './entityResolver'
import { TEAM_ALIASES } from './aliases'

const team = (team_id: string, abbreviation: string, location: string, name: string): TeamRow => ({
  team_id,
  abbreviation,
  location,
  name,
  display_name: `${location} ${name}`,
  aliases: TEAM_ALIASES[team_id] ?? [],
})

const person = (
  id: string,
  first_name: string,
  last_name: string,
  extra: Partial<PersonRow> = {},
): PersonRow => ({
  id,
  first_name,
  last_name,
  display_name: `${first_name} ${last_name}`,
  aliases: [],
  active: true,
  ...extra,
})

const idx = buildIndex({
  teams: [
    team('lal', 'LAL', 'Los Angeles', 'Lakers'),
    team('lac', 'LAC', 'LA', 'Clippers'),
    team('phi', 'PHI', 'Philadelphia', '76ers'),
    team('por', 'POR', 'Portland', 'Trail Blazers'),
    team('ny', 'NY', 'New York', 'Knicks'),
    team('gs', 'GS', 'Golden State', 'Warriors'),
  ],
  players: [
    person('1966', 'LeBron', 'James', { aliases: ['LeBron', 'King James'] }),
    person('5000', 'Bronny', 'James', { display_name: 'Bronny James Jr.' }),
    person('3136193', 'Nikola', 'Jokic', { display_name: 'Nikola Jokić' }),
    person('4278067', 'Nicolas', 'Claxton'),
    person('4277922', 'Jaren', 'Jackson Jr.', { display_name: 'Jaren Jackson Jr.' }),
    person('4066261', "D'Angelo", 'Russell'),
    person('1', 'Marcus', 'Morris Sr.', { display_name: 'Marcus Morris Sr.' }),
    person('2', 'Markieff', 'Morris'),
    person('3', 'Joel', 'Embiid'),
    person('4', 'Old', 'Embiid', { active: false }),
    person('5', 'Kevin', 'Durant', { aliases: ['KD'] }),
    // Former player seeded from formerEntities.ts, alongside an active Smith.
    person('2444', 'JR', 'Smith', { active: false }),
    person('4432639', 'Jabari', 'Smith Jr.', { display_name: 'Jabari Smith Jr.' }),
  ],
  coaches: [person('3024', 'JJ', 'Redick')],
})

const resolve = (e: Partial<{ teams: string[]; players: string[]; coaches: string[] }>) => {
  const misses: string[] = []
  const hits = resolveWithIndex(
    idx,
    { teams: [], players: [], coaches: [], ...e },
    (type, name) => misses.push(`${type}:${name}`),
  )
  return { ids: hits.map((h) => `${h.type}:${h.id}`), misses, hits }
}

test('norm strips diacritics, dots and apostrophes', () => {
  assert.equal(norm('Nikola Jokić'), 'nikola jokic')
  assert.equal(norm("D'Angelo Russell"), 'dangelo russell')
  assert.equal(norm('P.J. Washington'), 'pj washington')
})

test('teams resolve by full name, nickname, location, abbreviation and alias', () => {
  assert.deepEqual(
    resolve({ teams: ['Los Angeles Lakers', 'Lakers', 'LAL', 'Sixers', 'Blazers', 'Golden State', 'Knicks'] }).ids,
    ['team:lal', 'team:phi', 'team:por', 'team:gs', 'team:ny'],
  )
})

test('ambiguous LA forms never resolve', () => {
  const r = resolve({ teams: ['Los Angeles', 'LA', 'L.A.'] })
  assert.deepEqual(r.ids, [])
  assert.equal(r.misses.length, 3)
})

test('LA Clippers resolves through its alias even though LA alone does not', () => {
  assert.deepEqual(resolve({ teams: ['LA Clippers', 'Clippers'] }).ids, ['team:lac'])
})

test('players resolve by full name, alias, diacritics and suffix-less name', () => {
  assert.deepEqual(
    resolve({ players: ['LeBron James', 'King James', 'Nikola Jokic', 'Jaren Jackson', 'KD', "D'Angelo Russell"] }).ids,
    ['player:1966', 'player:3136193', 'player:4277922', 'player:5', 'player:4066261'],
  )
})

test('a shared last name never resolves on its own', () => {
  const r = resolve({ players: ['James', 'Morris'] })
  assert.deepEqual(r.ids, [])
  assert.deepEqual(r.misses, ['player:James', 'player:Morris'])
})

test('a unique last name resolves; the active player wins a shared exact key', () => {
  assert.deepEqual(resolve({ players: ['Jokic', 'Embiid'] }).ids, ['player:3136193', 'player:3'])
})

test('first-initial + last name catches short first names', () => {
  assert.deepEqual(resolve({ players: ['Nic Claxton', 'N. Claxton'] }).ids, ['player:4278067'])
})

test('first-initial fallback refuses when the initial is shared', () => {
  // Marcus and Markieff Morris are both "m morris".
  assert.deepEqual(resolve({ players: ['Mark Morris'] }).ids, [])
})

test('coaches resolve separately from players', () => {
  const r = resolve({ coaches: ['JJ Redick', 'Redick'], players: ['Redick'] })
  assert.deepEqual(r.ids, ['coach:3024'])
  assert.deepEqual(r.misses, ['player:Redick'])
})

test('hits carry the canonical name and the source surface form', () => {
  const [hit] = resolve({ teams: ['Sixers'] }).hits
  assert.equal(hit.name, 'Philadelphia 76ers')
  assert.equal(hit.sourceName, 'Sixers')
})

test('an inactive former player resolves by full name but not by a shared last name', () => {
  assert.deepEqual(resolve({ players: ['J.R. Smith'] }).ids, ['player:2444'])
  assert.deepEqual(resolve({ players: ['Jabari Smith'] }).ids, ['player:4432639'])
  assert.deepEqual(resolve({ players: ['Smith'] }).ids, ['player:4432639'])
})
