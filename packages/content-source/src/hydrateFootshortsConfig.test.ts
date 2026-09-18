/** Throwaway check: the story hydrator injects Asset-Studio crests/colors into
 *  fs:match-card and fs:match-tile layers via an alias-aware lookup, and never
 *  overwrites a YAML-authored value.
 *  (run: npx tsx src/hydrateFootshortsConfig.test.ts) */
import type { StoryConfig } from '@vismay/viz-engine'
import { hydrateFootshortsConfig, type TeamResolver } from './hydrateFootshortsConfig'
import type { TeamBrandRow } from './footshortsData'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

const spurs: TeamBrandRow = {
  id: 'u1', slug: 'tottenham-hotspur', name: 'Tottenham Hotspur FC',
  crest_url: 'https://crests.football-data.org/73.png', primary_color: '#A4ADBC',
}
const liverpool: TeamBrandRow = {
  id: 'u2', slug: 'liverpool', name: 'Liverpool FC',
  crest_url: 'https://crests.football-data.org/64.png', primary_color: '#C8102E',
}

// Stand-in for resolveTeamsByLabel: the alias rules it applies, in miniature.
const asked: string[][] = []
const resolve: TeamResolver = async (labels) => {
  asked.push(labels)
  const out = new Map<string, TeamBrandRow>()
  for (const l of labels) {
    const k = l.toLowerCase()
    if (['tottenham', 'spurs', 'tottenham hotspur', 'tottenham-hotspur'].includes(k)) out.set(l, spurs)
    if (['liverpool', 'liverpool fc'].includes(k)) out.set(l, liverpool)
  }
  return out
}

/** A card literal with every hydratable field declared, so the assertions
 *  below can read what hydration wrote. */
type CardRaw = {
  type: string
  home: string
  away: string
  homeCrestUrl?: string
  awayCrestUrl?: string
  homeColor?: string
  awayColor?: string
}

const config = (foreground: unknown[]): StoryConfig =>
  ({ sections: [{ foreground }] }) as unknown as StoryConfig

async function main() {
  // fs:match-card — YAML short form resolves; explicit YAML color is kept.
  const card: CardRaw = { type: 'fs:match-card', home: 'Liverpool', away: 'Tottenham', awayColor: '#000000' }
  await hydrateFootshortsConfig(config([card]), resolve)
  ok('card: home crest injected', card.homeCrestUrl === liverpool.crest_url)
  ok('card: home color injected', card.homeColor === '#C8102E')
  ok('card: away crest injected', card.awayCrestUrl === spurs.crest_url)
  ok('card: YAML awayColor never overwritten', card.awayColor === '#000000')

  // fs:match-tile — refs with null crest/color get filled; set values stay.
  const tile = {
    type: 'fs:match-tile',
    layout: 'grid',
    fixtures: [{
      id: 'm1',
      home: { id: 'liverpool', slug: 'liverpool', name: 'Liverpool', crest_url: null, primary_color: '#FF0000' },
      away: { id: 'spurs', slug: 'spurs', name: 'Tottenham Hotspur', crest_url: null, primary_color: null },
    }],
  }
  await hydrateFootshortsConfig(config([tile]), resolve)
  const [f] = tile.fixtures
  ok('tile: home crest filled', f.home.crest_url === liverpool.crest_url)
  ok('tile: authored home color kept', f.home.primary_color === '#FF0000')
  ok('tile: away crest filled via alias slug', f.away.crest_url === spurs.crest_url)
  ok('tile: away color filled via alias slug', f.away.primary_color === '#A4ADBC')

  // single-fixture layout is walked too
  const single = {
    type: 'fs:match-tile',
    fixture: { id: 'm2', home: { id: 'x', slug: 'nowhere-fc', name: 'Nowhere', crest_url: null, primary_color: null }, away: null },
  }
  await hydrateFootshortsConfig(config([single]), resolve)
  ok('tile: unresolved team left untouched', single.fixture.home.primary_color === null)

  // nothing to do → resolver never called
  const before = asked.length
  const full: CardRaw = { type: 'fs:match-card', home: 'Liverpool', away: 'Spurs', homeCrestUrl: 'x', homeColor: '#1', awayCrestUrl: 'y', awayColor: '#2' }
  await hydrateFootshortsConfig(config([full, { type: 'text', body: 'hi' }]), resolve)
  ok('fully authored card skips the lookup', asked.length === before)

  // resolver failure → config returned unchanged
  const failing: TeamResolver = async () => { throw new Error('no env') }
  const c2: CardRaw = { type: 'fs:match-card', home: 'Liverpool', away: 'Spurs' }
  const out = await hydrateFootshortsConfig(config([c2]), failing)
  ok('lookup failure is a no-op', out.sections.length === 1 && c2.homeColor === undefined)

  if (failures) { console.error(`${failures} failing`); process.exit(1) }
}
main()
