/** Checks for the shared draw, the research stub and the brief sections.
 *  (run: npx tsx src/draw.test.ts) */
import assert from 'node:assert/strict'
import { ATLAS, DESK, EPICS, FOOTSHORTS, VIZNBA, epicRoute, isPhilosophical, reelPool } from './datasets'
import { DRAW_RULES, draw, normalizeLocks } from './draw'
import { assignmentSection, deliverablesSection, formatSection, researchAppendix } from './spinBrief'
import { extractHeroInsight, gameSummary, researchFileName, researchStub } from './stub'
import { hasEmDash } from './text'
import {
  randomizersFor,
  type AtlasPicks,
  type DeskPicks,
  type DrawResult,
  type EpicsPicks,
  type FootshortsFixtureRef,
  type FootshortsNews,
  type FootshortsPicks,
  type FootshortsTeamNews,
  type SpinHistoryEntry,
  type SpinRecord,
  type ViznbaGameRef,
  type ViznbaNews,
  type ViznbaPicks,
} from './types'

const NOW = new Date('2026-10-05T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString()
const entry = (r: DrawResult, d: number, status: SpinHistoryEntry['status'] = 'spun'): SpinHistoryEntry => ({
  status,
  primary: r.primary,
  combo: r.combo,
  meta: r.meta,
  picks: r.picks,
  createdAt: daysAgo(d),
})
const asSpin = (r: DrawResult, extra: Partial<SpinRecord> = {}): SpinRecord => ({
  ...r,
  id: '00000000-0000-4000-8000-000000000001',
  seed: '0000002a',
  status: 'spun',
  rejectedReason: null,
  respinOf: null,
  options: { locks: [] },
  researchMd: null,
  heroInsight: null,
  reviewNote: null,
  storySlug: null,
  createdBy: 'test',
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...extra,
})

// Datasets: the playbook's coverage.
assert.equal(ATLAS.countries.filter((c) => !c.extra).length, 193)
assert.equal(new Set(ATLAS.countries.map((c) => c.iso)).size, ATLAS.countries.length)
for (const c of ATLAS.countries) assert.ok(ATLAS.regions.includes(c.region), c.name)
for (const e of EPICS.epics) {
  assert.ok(EPICS.traditions.includes(e.tradition), `${e.title}: tradition ${e.tradition}`)
  assert.ok(e.episodes.length && e.episodes.every((ep) => ep.places.length), `${e.title}: empty episode`)
  const ids = epicRoute(e).map((r) => `${r.episodeId}/${r.place.id}`)
  assert.equal(new Set(ids).size, ids.length, `${e.title}: duplicate place`)
}
for (const s of DESK.sub_industries) {
  assert.ok(DESK.industries.some((i) => i.id === s.industry), s.id)
  assert.ok(s.key_metrics.length >= 3 && s.key_metrics.length <= 5, `${s.id}: 3 to 5 metrics`)
}
assert.ok(EPICS.epics.some((e) => isPhilosophical(e.types)))

// Determinism: same seed, same spin.
for (const randomizer of ['desk', 'atlas', 'epics'] as const) {
  const a = draw({ randomizer, seed: 7, now: NOW })
  const b = draw({ randomizer, seed: 7, now: NOW })
  assert.deepEqual(a, b)
  assert.ok(a.rules.length > 0)
  for (const r of a.rules) assert.ok(!hasEmDash(r.text), r.text)
}

// Locks: parents come along; option reels and unknown keys drop.
assert.deepEqual(normalizeLocks('desk', ['sub']), ['industry', 'sub'])
assert.deepEqual(normalizeLocks('epics', ['place']), ['epic', 'episode', 'place'])
assert.deepEqual(normalizeLocks('atlas', ['pair', 'nope', 'lens']), ['lens'])

// Desk: a locked sub-industry keeps its value; a locked industry keeps the draw inside it.
{
  const first = draw({ randomizer: 'desk', seed: 1, now: NOW })
  const p = first.picks as DeskPicks
  for (let seed = 2; seed < 40; seed++) {
    const next = draw({ randomizer: 'desk', seed, now: NOW, prev: first, locks: ['industry'] })
    const sub = DESK.sub_industries.find((s) => s.id === (next.picks as DeskPicks).subId)!
    assert.equal(sub.industry, DESK.sub_industries.find((s) => s.id === p.subId)!.industry)
    const locked = draw({ randomizer: 'desk', seed, now: NOW, prev: first, locks: ['sub', 'lens'] })
    assert.equal((locked.picks as DeskPicks).subId, p.subId)
    assert.equal((locked.picks as DeskPicks).lens, p.lens)
  }
}

// Desk: 30-day block, with the heat exemption.
{
  const cool = DESK.sub_industries.find((s) => s.heat < DRAW_RULES.heatExempt)!
  const hot = DESK.sub_industries.find((s) => s.heat >= DRAW_RULES.heatExempt)!
  const fake = (id: string) => ({ ...draw({ randomizer: 'desk', seed: 3, now: NOW }), primary: id, combo: `${id}|x|y` })
  const history = [entry(fake(cool.id), 10), entry(fake(hot.id), 10)]
  let sawHot = false
  for (let seed = 0; seed < 300; seed++) {
    const r = draw({ randomizer: 'desk', seed, now: NOW, history })
    assert.notEqual((r.picks as DeskPicks).subId, cool.id, 'blocked inside 30 days')
    if ((r.picks as DeskPicks).subId === hot.id) sawHot = true
  }
  assert.ok(sawHot, 'heat-exempt segment can come back')
  // Outside 30 days it is back in the pool.
  const old = [entry(fake(cool.id), 31)]
  assert.ok([...Array(400).keys()].some((seed) => (draw({ randomizer: 'desk', seed, now: NOW, history: old }).picks as DeskPicks).subId === cool.id))
}

// Desk: never-refreshed heat is stale; a failed refresh forces Evergreen; old news shifts the window.
{
  const r = draw({ randomizer: 'desk', seed: 11, now: NOW })
  assert.ok(r.subject.randomizer === 'desk' && r.subject.heatStale)
  const subId = (r.picks as DeskPicks).subId
  const failed = draw({
    randomizer: 'desk',
    seed: 11,
    now: NOW,
    prev: r,
    locks: ['sub'],
    heat: [{ subId, heat: 50, heatUpdated: daysAgo(1), topHeadlines: [], refreshStatus: 'failed', refreshError: 'feed down', refreshedBy: 'test' }],
  })
  assert.equal((failed.picks as DeskPicks).fresh, 'Evergreen')
  assert.ok(failed.rules.some((x) => x.tag === 'refresh'))
  const oldNews = draw({
    randomizer: 'desk',
    seed: 11,
    now: NOW,
    prev: { picks: { ...(r.picks as DeskPicks), freshDrawn: 'Breaking' } },
    locks: ['sub', 'fresh'],
    heat: [{ subId, heat: 50, heatUpdated: daysAgo(1), topHeadlines: [{ title: 't', url: 'https://x', date: daysAgo(30).slice(0, 10) }], refreshStatus: 'ok', refreshError: null, refreshedBy: 'test' }],
  })
  assert.equal((oldNews.picks as DeskPicks).freshDrawn, 'Breaking')
  assert.equal((oldNews.picks as DeskPicks).fresh, 'Developing')
  assert.ok(oldNews.subject.randomizer === 'desk' && !oldNews.subject.heatStale)
  assert.ok(oldNews.rules.some((x) => x.tag === 'fallback'))
}

// Desk: 90-day block re-draws the free reels.
{
  const r = draw({ randomizer: 'desk', seed: 5, now: NOW })
  for (let seed = 0; seed < 50; seed++) {
    const again = draw({ randomizer: 'desk', seed, now: NOW, prev: r, locks: ['sub'], history: [entry(r, 40)] })
    // Same segment is fine (heat or lock), same full combination is not.
    if ((again.picks as DeskPicks).subId === (r.picks as DeskPicks).subId) assert.notEqual(again.combo, r.combo)
  }
}

// Atlas: region balance re-draws once after a repeat; the 30-day block holds.
{
  const first = draw({ randomizer: 'atlas', seed: 9, now: NOW })
  const region = first.meta.region
  let repeats = 0
  for (let seed = 0; seed < 500; seed++) {
    const r = draw({ randomizer: 'atlas', seed, now: NOW, history: [entry(first, 2)] })
    assert.notEqual((r.picks as AtlasPicks).iso, (first.picks as AtlasPicks).iso)
    if (r.meta.region === region) repeats++
  }
  // Without balancing a region repeats 1 in 5; one re-draw makes it 1 in 25.
  assert.ok(repeats < 500 / 10, `region repeated ${repeats} times in 500`)
  const pair = draw({ randomizer: 'atlas', seed: 4, now: NOW, pair: true })
  assert.ok(pair.reels.pair && (pair.picks as AtlasPicks).pairIso && (pair.picks as AtlasPicks).pairIso !== (pair.picks as AtlasPicks).iso)
  const pairAgain = draw({ randomizer: 'atlas', seed: 5, now: NOW, pair: true, history: [entry(pair, 3)] })
  assert.ok(pairAgain.rules.some((x) => x.tag === 'pair' && x.kind === 'warn'), 'second pair spin in a week warns')
}

// Epics: never the same tradition twice in a row; the philosophical quota; sequence mode.
{
  const first = draw({ randomizer: 'epics', seed: 2, now: NOW })
  for (let seed = 0; seed < 200; seed++) {
    const r = draw({ randomizer: 'epics', seed, now: NOW, history: [entry(first, 1)] })
    assert.notEqual(r.meta.tradition, first.meta.tradition)
  }
  const heroic = EPICS.epics.filter((e) => !isPhilosophical(e.types))
  const fakeHeroic = (i: number): SpinHistoryEntry => ({
    status: 'spun',
    primary: heroic[i]!.id,
    combo: `${heroic[i]!.id}|x`,
    meta: { tradition: heroic[i]!.tradition, types: heroic[i]!.types },
    picks: { epicId: heroic[i]!.id, episodeId: heroic[i]!.episodes[0]!.id, placeId: heroic[i]!.episodes[0]!.places[0]!.id, lens: 'Is it real' },
    createdAt: daysAgo(3 - i),
  })
  for (let seed = 0; seed < 200; seed++) {
    const r = draw({ randomizer: 'epics', seed, now: NOW, history: [fakeHeroic(0), fakeHeroic(1)] })
    assert.ok(isPhilosophical(r.meta.types), 'quota forces a philosophical or foundational epic')
  }
  const odyssey = EPICS.epics.find((e) => e.id === 'odyssey')!
  const route = epicRoute(odyssey)
  const start: SpinHistoryEntry = {
    status: 'spun',
    primary: 'odyssey',
    combo: 'odyssey|x',
    meta: { tradition: odyssey.tradition, types: odyssey.types },
    picks: { epicId: 'odyssey', episodeId: route[0]!.episodeId, placeId: route[0]!.place.id, lens: 'Is it real' },
    createdAt: daysAgo(1),
  }
  const next = draw({ randomizer: 'epics', seed: 1, now: NOW, history: [start], sequence: true })
  assert.equal((next.picks as EpicsPicks).placeId, route[1]!.place.id)
  assert.ok(next.subject.randomizer === 'epics' && next.subject.sequence)
}

// Footshorts: a synthetic news snapshot. Six Premier League sides (one with
// no news), four in the Champions League, and nothing in the rest.
const fx = (id: string, comp: string, home: FootshortsTeamNews | string, away: FootshortsTeamNews | string, d: number, done: boolean): FootshortsFixtureRef => ({
  id,
  competition: comp,
  kickoff: daysAgo(d),
  status: done ? 'FINISHED' : 'TIMED',
  homeId: typeof home === 'string' ? `id-${home}` : home.id,
  awayId: typeof away === 'string' ? `id-${away}` : away.id,
  home: typeof home === 'string' ? home : home.name,
  away: typeof away === 'string' ? away : away.name,
  homeScore: done ? 2 : null,
  awayScore: done ? 1 : null,
})
const team = (slug: string, competitions: string[], heat: number, newsDaysAgo: number[]): FootshortsTeamNews => ({
  id: `id-${slug}`,
  slug,
  name: slug.replace(/(^|-)\w/g, (m) => m.replace('-', ' ').toUpperCase()),
  country: 'England',
  crestUrl: null,
  competitions,
  heat,
  articles: newsDaysAgo.length,
  headlines: newsDaysAgo.slice(0, 3).map((d) => ({ title: `${slug} news`, url: `https://example.com/${slug}/${d}`, publisher: 'BBC Sport', date: daysAgo(d).slice(0, 10) })),
  recent: [fx(`f-${slug}-1`, competitions[0]!, slug, 'other', 3, true)],
  upcoming: [fx(`f-${slug}-2`, competitions[0]!, 'other', slug, -4, false)],
})
const PL = ['arsenal', 'chelsea', 'liverpool', 'everton', 'fulham', 'brentford']
const NEWS: FootshortsNews = {
  asOf: NOW.toISOString(),
  windowDays: 14,
  competitions: FOOTSHORTS.competitions.map((c) => ({
    slug: c.slug,
    heat: c.slug === 'premier-league' ? 100 : c.slug === 'champions-league' ? 60 : 0,
    articles: c.slug === 'premier-league' ? 40 : 10,
    headlines: [],
    teams: c.slug === 'premier-league' ? 6 : c.slug === 'champions-league' ? 4 : 0,
  })),
  teams: PL.map((slug, i) =>
    team(slug, i < 4 ? ['premier-league', 'champions-league'] : ['premier-league'], slug === 'brentford' ? 0 : 90 - i * 15, slug === 'brentford' ? [] : [1, 2, 6]),
  ),
}
// Arsenal host Chelsea in the window: the head-to-head should find it.
NEWS.teams[0]!.upcoming = [fx('f-ars-che', 'premier-league', NEWS.teams[0]!, NEWS.teams[1]!, -5, false)]

assert.deepEqual(randomizersFor('footshorts'), ['footshorts'])
assert.deepEqual(randomizersFor('vizmaya-fyi'), ['desk', 'atlas', 'epics'])
assert.deepEqual(normalizeLocks('footshorts', ['team', 'pair']), ['competition', 'team'])
assert.deepEqual(reelPool('footshorts', 'team', ['A', 'B']), ['A', 'B'])
assert.throws(() => draw({ randomizer: 'footshorts', seed: 1, now: NOW }), /news snapshot/)
{
  const a = draw({ randomizer: 'footshorts', seed: 7, now: NOW, news: NEWS })
  assert.deepEqual(a, draw({ randomizer: 'footshorts', seed: 7, now: NOW, news: NEWS }))
  for (const r of a.rules) assert.ok(!hasEmDash(r.text), r.text)
  const live = new Set(['premier-league', 'champions-league'])
  for (let seed = 0; seed < 200; seed++) {
    const r = draw({ randomizer: 'footshorts', seed, now: NOW, news: NEWS })
    const p = r.picks as FootshortsPicks
    assert.ok(live.has(p.competition), `only tournaments with fixtures: ${p.competition}`)
    const t = NEWS.teams.find((x) => x.slug === p.team)!
    assert.ok(t.competitions.includes(p.competition), 'the team plays in the tournament')
    assert.equal(r.primary, p.team)
    assert.ok(r.subject.randomizer === 'footshorts' && r.subject.fixtureIds.length > 0)
    // Brentford have no news: Matchday can never stand for them.
    if (p.team === 'brentford') assert.notEqual(p.fresh, 'Matchday')
  }
  // Locks keep the team and angle; the same tournament twice in a row is re-drawn once.
  for (let seed = 0; seed < 40; seed++) {
    const locked = draw({ randomizer: 'footshorts', seed, now: NOW, news: NEWS, prev: a, locks: ['team', 'angle'] })
    assert.equal((locked.picks as FootshortsPicks).team, (a.picks as FootshortsPicks).team)
    assert.equal((locked.picks as FootshortsPicks).angle, (a.picks as FootshortsPicks).angle)
  }
  let repeats = 0
  for (let seed = 0; seed < 400; seed++) {
    const r = draw({ randomizer: 'footshorts', seed, now: NOW, news: NEWS, history: [entry(a, 1)] })
    if (r.meta.competition === a.meta.competition) repeats++
    assert.notEqual(r.primary, a.primary === 'arsenal' ? '__' : a.primary, 'blocked inside 30 days unless heat forces it')
  }
  assert.ok(repeats < 400 * 0.75, `tournament repeated ${repeats} times in 400`)
}
{
  // Head-to-head: Arsenal's opponent is Chelsea, the side they meet in the window.
  const prev = draw({ randomizer: 'footshorts', seed: 1, now: NOW, news: NEWS })
  const ars = { picks: { ...(prev.picks as FootshortsPicks), competition: 'premier-league', team: 'arsenal' } }
  const h2h = draw({ randomizer: 'footshorts', seed: 3, now: NOW, news: NEWS, prev: ars, locks: ['team'], pair: true })
  assert.equal((h2h.picks as FootshortsPicks).opponent, 'chelsea')
  assert.ok(h2h.reels.pair && h2h.summary.includes(' v '))
  assert.ok(h2h.subject.randomizer === 'footshorts' && h2h.subject.fixtureIds[0] === 'f-ars-che')
  assert.ok(h2h.rules.some((x) => x.tag === 'pair' && x.kind === 'good'))
}

// VizNBA: all 30 franchises, the Celtics and Knicks busy and meeting in the
// window, the Jazz with no news at all.
const game = (id: string, away: string, home: string, d: number): ViznbaGameRef => {
  const done = d > 0
  const name = (t: string) => VIZNBA.teams.find((x) => x.id === t)?.name ?? t
  return {
    id,
    date: daysAgo(d),
    state: done ? 'post' : 'pre',
    season: 'Regular Season',
    homeId: home,
    awayId: away,
    home: name(home),
    away: name(away),
    homeScore: done ? 108 : null,
    awayScore: done ? 112 : null,
  }
}
const NBA: ViznbaNews = {
  asOf: NOW.toISOString(),
  windowDays: 14,
  conferences: [
    { slug: 'east', heat: 100, articles: 30, headlines: [] },
    { slug: 'west', heat: 70, articles: 20, headlines: [] },
  ],
  teams: VIZNBA.teams.map((t, i) => {
    const heat = t.id === 'utah' ? 0 : t.id === 'bos' || t.id === 'ny' ? 95 : 20 + (i % 5) * 10
    const news = t.id === 'utah' ? [] : [1, 4, 9]
    return {
      id: t.id,
      espnId: t.espn_id,
      abbreviation: t.abbreviation,
      name: t.name,
      conference: t.conference,
      division: t.division,
      logoUrl: null,
      color: t.color,
      heat,
      articles: news.length,
      headlines: news.map((d) => ({ title: `${t.name} news`, url: `https://example.com/${t.id}/${d}`, publisher: 'ESPN', date: daysAgo(d).slice(0, 10), topic: 'game' })),
      people: [],
      recent: [game(`g-${t.id}-1`, t.id, 'other', 2)],
      upcoming: [game(`g-${t.id}-2`, 'other', t.id, -2)],
    }
  }),
  schedule: { ok: true, games: 60, error: null },
}
// The Celtics visit the Knicks in the window: the head-to-head should find it.
NBA.teams.find((t) => t.id === 'bos')!.upcoming = [game('g-bos-ny', 'bos', 'ny', -3)]

assert.equal(VIZNBA.teams.length, 30)
assert.equal(new Set(VIZNBA.teams.map((t) => t.id)).size, 30)
for (const c of VIZNBA.conferences) assert.equal(VIZNBA.teams.filter((t) => t.conference === c.slug).length, 15)
assert.deepEqual(randomizersFor('viznba'), ['viznba'])
assert.deepEqual(normalizeLocks('viznba', ['team', 'pair']), ['conference', 'team'])
assert.equal(reelPool('viznba', 'team').length, 30)
assert.throws(() => draw({ randomizer: 'viznba', seed: 1, now: NOW }), /news snapshot/)
assert.equal(gameSummary(game('g', 'bos', 'ny', 2)), `Boston Celtics 112 @ New York Knicks 108 · ${daysAgo(2).slice(0, 10)} · Regular Season, final`)
{
  const a = draw({ randomizer: 'viznba', seed: 7, now: NOW, nbaNews: NBA })
  assert.deepEqual(a, draw({ randomizer: 'viznba', seed: 7, now: NOW, nbaNews: NBA }))
  for (const r of a.rules) assert.ok(!hasEmDash(r.text), r.text)
  for (let seed = 0; seed < 200; seed++) {
    const r = draw({ randomizer: 'viznba', seed, now: NOW, nbaNews: NBA })
    const p = r.picks as ViznbaPicks
    const t = NBA.teams.find((x) => x.id === p.team)!
    assert.equal(t.conference, p.conference, 'the team plays in the conference')
    assert.equal(r.primary, p.team)
    assert.ok(r.subject.randomizer === 'viznba' && r.subject.gameIds.length > 0)
    // The Jazz have no news: Last night can never stand for them.
    if (p.team === 'utah') assert.notEqual(p.fresh, 'Last night')
  }
  for (let seed = 0; seed < 40; seed++) {
    const locked = draw({ randomizer: 'viznba', seed, now: NOW, nbaNews: NBA, prev: a, locks: ['team', 'angle'] })
    assert.equal((locked.picks as ViznbaPicks).team, (a.picks as ViznbaPicks).team)
    assert.equal((locked.picks as ViznbaPicks).angle, (a.picks as ViznbaPicks).angle)
  }
  let repeats = 0
  for (let seed = 0; seed < 400; seed++) {
    const r = draw({ randomizer: 'viznba', seed, now: NOW, nbaNews: NBA, history: [entry(a, 1)] })
    if (r.meta.conference === a.meta.conference) repeats++
    if (NBA.teams.find((x) => x.id === a.primary)!.heat < DRAW_RULES.heatExempt) assert.notEqual(r.primary, a.primary, 'blocked inside 30 days')
  }
  assert.ok(repeats < 400 * 0.5, `conference repeated ${repeats} times in 400`)
  // A failed schedule read is said, and the spin carries no games.
  const noSchedule = { ...NBA, schedule: { ok: false, games: 0, error: 'HTTP 503' }, teams: NBA.teams.map((t) => ({ ...t, recent: [], upcoming: [] })) }
  const quiet = draw({ randomizer: 'viznba', seed: 5, now: NOW, nbaNews: noSchedule })
  assert.ok(quiet.rules.some((x) => x.tag === 'schedule' && x.kind === 'warn'))
  assert.ok(quiet.subject.randomizer === 'viznba' && quiet.subject.gameIds.length === 0)
}
{
  // Head-to-head: the Celtics' opponent is the Knicks, the team they play in the window.
  const prev = draw({ randomizer: 'viznba', seed: 1, now: NOW, nbaNews: NBA })
  const bos = { picks: { ...(prev.picks as ViznbaPicks), conference: 'east' as const, team: 'bos' } }
  const h2h = draw({ randomizer: 'viznba', seed: 3, now: NOW, nbaNews: NBA, prev: bos, locks: ['team'], pair: true })
  assert.equal((h2h.picks as ViznbaPicks).opponent, 'ny')
  assert.ok(h2h.reels.pair && h2h.summary.includes(' v '))
  assert.ok(h2h.subject.randomizer === 'viznba' && h2h.subject.gameIds[0] === 'g-bos-ny')
  assert.ok(h2h.rules.some((x) => x.tag === 'pair' && x.kind === 'good'))
}

// Stub and brief sections.
for (const randomizer of ['desk', 'atlas', 'epics', 'footshorts', 'viznba'] as const) {
  const spin = asSpin(draw({ randomizer, seed: 21, now: NOW, news: NEWS, nbaNews: NBA }))
  const stub = researchStub(spin)
  assert.ok(stub.includes('## Claims log'))
  assert.ok(stub.includes('## HERO INSIGHT'))
  assert.equal(extractHeroInsight(stub), null, 'the placeholder is not an insight')
  assert.ok(researchFileName(spin).startsWith(`2026-10-05_${randomizer}_`))
  const sections = [assignmentSection(spin), deliverablesSection(spin, 'https://vizmaya.fyi'), formatSection(spin), researchAppendix(spin), stub]
  for (const s of sections) assert.ok(!hasEmDash(s), `${randomizer}: em dash in a generated section`)
  assert.ok(assignmentSection(spin).includes(spin.id))
  const filled = stub.replace(/_One sentence[^\n]*_/, 'The port moved, the faith stayed.')
  assert.equal(extractHeroInsight(filled), 'The port moved, the faith stayed.')
  const approved = asSpin(spin, { status: 'approved', heroInsight: 'The port moved, the faith stayed.', researchMd: filled })
  assert.ok(assignmentSection(approved).includes('> The port moved, the faith stayed.'))
  assert.ok(researchAppendix(approved).startsWith('# Research file'))
}
assert.equal(extractHeroInsight('# R\n\n## HERO INSIGHT\n\n**Bold claim.**\n\nSupporting claims:\n1. a'), 'Bold claim.')
assert.equal(extractHeroInsight('# R\n\n## Notes'), null)

console.log('randomizer: ok')
