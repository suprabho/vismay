import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canonicalTeamKey, normalizeEntityKey, teamLookupSlugs } from '@footshorts/shared/entityKeys';

test('normalizeEntityKey lowercases, strips accents and collapses punctuation', () => {
  assert.equal(normalizeEntityKey('Brighton & Hove Albion'), 'brighton-hove-albion');
  assert.equal(normalizeEntityKey('Club Atlético de Madrid'), 'club-atletico-de-madrid');
  assert.equal(normalizeEntityKey('  Spurs  '), 'spurs');
});

test('canonicalTeamKey strips the club affix and applies aliases', () => {
  assert.equal(canonicalTeamKey('Tottenham Hotspur FC'), 'tottenham-hotspur');
  assert.equal(canonicalTeamKey('AFC Bournemouth'), 'bournemouth');
  assert.equal(canonicalTeamKey('Spurs'), 'tottenham-hotspur');
  assert.equal(canonicalTeamKey('Man Utd'), 'manchester-united');
});

test('teamLookupSlugs lists the literal slug first, then affix-stripped, then aliases', () => {
  // ESPN's display name: already the canonical slug.
  assert.deepEqual(teamLookupSlugs('Tottenham Hotspur'), ['tottenham-hotspur']);
  // football-data's official name: the literal form is kept ahead of the stripped one.
  assert.deepEqual(teamLookupSlugs('Tottenham Hotspur FC'), ['tottenham-hotspur-fc', 'tottenham-hotspur']);
  // A YAML short form reaches the entity through the alias table.
  assert.deepEqual(teamLookupSlugs('Tottenham'), ['tottenham', 'tottenham-hotspur']);
  assert.deepEqual(teamLookupSlugs('Spurs'), ['spurs', 'tottenham-hotspur']);
  // An entity slug passed straight through is a single literal candidate.
  assert.deepEqual(teamLookupSlugs('manchester-united'), ['manchester-united']);
});
