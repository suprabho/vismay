/** Checks for the shared draw, the research stub and the brief sections.
 *  (run: npx tsx src/draw.test.ts) */
import assert from 'node:assert/strict'
import { ATLAS, DESK, EPICS, FOOTSHORTS, OCW, VIZNBA, epicRoute, isHandsOn, isPhilosophical, reelPool } from './datasets'
import { DRAW_RULES, draw, normalizeLocks, planOcw } from './draw'
import { enrichedOcwCourse, loadOcwPool, ocwFileFromHit, ocwPageOffset, type OcwHit } from './ocwPool'
import { assignmentSection, deliverablesSection, formatSection, researchAppendix } from './spinBrief'
import { extractHeroInsight, gameSummary, ocwCourseLabel, ocwCreditLine, researchFileName, researchStub } from './stub'
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
  type OcwFile,
  type OcwPicks,
  type OcwPlan,
  type OcwPool,
  type SpinHistoryEntry,
  type SpinRecord,
  type ViznbaGameRef,
  type ViznbaNews,
  type ViznbaPicks,
} from './types'

const NOW = new Date('2026-10-05T12:00:00Z')
/** Async checks, awaited before the file reports ok. */
const pending: Promise<void>[] = []
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

// Desk: once most segments were spun this month, the hot ones do not take over.
// (Regression: HBM memory and Data center power, both above heatExempt, came up
// on nearly every spin because they were the only segments left in the pool.)
{
  const fake = (id: string, lens = 'x') => ({ ...draw({ randomizer: 'desk', seed: 3, now: NOW }), primary: id, combo: `${id}|${lens}|y` })
  const hot = DESK.sub_industries.filter((s) => s.heat >= DRAW_RULES.heatExempt)
  const cool = DESK.sub_industries.filter((s) => s.heat < DRAW_RULES.heatExempt)
  // Every cool segment 20 to 25 days ago, every hot one yesterday.
  const history = [...cool.map((s, i) => entry(fake(s.id), 20 + (i % 6))), ...hot.map((s) => entry(fake(s.id), 1))]
  for (let seed = 0; seed < 300; seed++) {
    const r = draw({ randomizer: 'desk', seed, now: NOW, history })
    assert.ok(!hot.some((s) => s.id === r.primary), 'a hot segment spun yesterday stays out')
  }
  // The lifted block favours the segments spun longest ago (the oldest third: 23 to 25 days).
  const oldest = new Set(cool.filter((_, i) => i % 6 >= 3).map((s) => s.id))
  for (let seed = 0; seed < 100; seed++) {
    const r = draw({ randomizer: 'desk', seed, now: NOW, history })
    assert.ok(oldest.has(r.primary), `lifted to the oldest spins, got ${r.primary}`)
  }
  // A hot segment comes back with a lens it has not had.
  const h = hot[0]!
  const used = [entry(fake(h.id, 'Regulatory'), 8), entry(fake(h.id, 'Market'), 9)]
  for (let seed = 0; seed < 300; seed++) {
    const r = draw({ randomizer: 'desk', seed, now: NOW, history: used })
    if (r.primary === h.id) assert.ok(!['Regulatory', 'Market'].includes((r.picks as DeskPicks).lens), 'a fresh lens for a repeat segment')
  }
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
assert.deepEqual(randomizersFor('vizmaya-fyi'), ['desk', 'atlas', 'epics', 'ocw'])
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


// OCW Desk: the committed taxonomy, then a synthetic pool (no network).
assert.equal(OCW.fields.length, 11)
assert.ok(OCW.topics.length >= 90)
assert.equal(new Set(OCW.topics.map((t) => t.id)).size, OCW.topics.length)
for (const t of OCW.topics) assert.ok(OCW.fields.some((f) => f.id === t.field), t.name)
for (const f of OCW.fields) assert.ok(OCW.topics.some((t) => t.field === f.id), `${f.name}: no topics`)
assert.equal(OCW.kinds.length, 6)
assert.ok(OCW.kinds.some((k) => k.hands_on) && OCW.kinds.some((k) => !k.hands_on))
for (const t of OCW.topics) for (const k of OCW.kinds) assert.equal(typeof t.files[k.name], 'number', `${t.name}: no count for ${k.name}`)
assert.ok(OCW.topics.some((t) => OCW.kinds.every((k) => t.files[k.name] === 0)), 'the taxonomy records topics with no files')
{
  // The plan never lands on a topic without files, nor on a kind the topic has none of.
  for (let seed = 0; seed < 300; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW })
    assert.ok(plan.topic.files[plan.kind.name]! > 0, `${plan.topic.name} has no ${plan.kind.name}`)
  }
  // A topic with only reading kinds: the quota cannot force a hands-on kind, so it yields.
  const readingOnly = OCW.topics.find((t) => OCW.kinds.some((k) => !k.hands_on && t.files[k.name]! > 0) && OCW.kinds.every((k) => !k.hands_on || t.files[k.name] === 0))
  if (readingOnly) {
    const prev = { picks: { field: readingOnly.field, topic: readingOnly.id, kind: 'Lecture Notes', lens: 'The one idea', courseId: 1, fileId: 1 } }
    const past = (d: number): SpinHistoryEntry => ({ status: 'spun', primary: 'x', combo: 'x', meta: { kind: 'Readings', topic: 0, field: 0 }, picks: prev.picks, createdAt: daysAgo(d) })
    const plan = planOcw({ randomizer: 'ocw', seed: 5, now: NOW, prev, locks: ['topic'], history: [past(2), past(1)] })
    assert.equal(plan.topic.id, readingOnly.id)
    assert.ok(!plan.kind.hands_on && plan.topic.files[plan.kind.name]! > 0)
  }
}
assert.ok(isHandsOn('Problem Sets') && !isHandsOn('Lecture Notes') && !isHandsOn(undefined))
assert.deepEqual(normalizeLocks('ocw', ['resource']), ['field', 'topic', 'kind', 'course', 'resource'])
assert.deepEqual(normalizeLocks('ocw', ['course', 'lens']), ['field', 'topic', 'course', 'lens'])
assert.equal(reelPool('ocw', 'field').length, 11)
assert.deepEqual(reelPool('ocw', 'course', ['A', 'B']), ['A', 'B'])
assert.throws(() => draw({ randomizer: 'ocw', seed: 1, now: NOW }), /pool/)

/** A pool page for a plan: `n` files spread over `courses` courses, every file of the plan's kind. */
const ocwFile = (i: number, course: number, kind: string, courseTitle = `Course ${course}`): OcwFile => ({
  id: 1000 + i,
  key: `courses/c-${course}/resources/f-${String(i).padStart(3, '0')}/`,
  url: `https://ocw.mit.edu/courses/c-${course}/resources/f-${i}/`,
  title: `File ${i}`,
  contentType: 'pdf',
  fileType: 'application/pdf',
  kinds: [kind],
  youtubeId: null,
  courseId: course,
  courseReadableId: `${course}.000+fall_2020`,
  courseTitle,
  courseSlug: `courses/c-${course}`,
  courseNumber: `${course}.000`,
  departments: ['Physics'],
  year: 2020,
  semester: 'Fall',
})
const poolFor = (plan: OcwPlan, n = 30, courses = 6): OcwPool => ({
  asOf: NOW.toISOString(),
  query: plan.query,
  count: plan.query.courseId === null ? 3862 : n,
  offset: plan.query.courseId === null ? Math.floor(plan.u * 3862) : 0,
  files: [...Array(n).keys()].map((i) => ocwFile(i, plan.query.courseId ?? 1 + (i % courses), plan.query.kind)),
})
const spinOcw = (input: Omit<Parameters<typeof draw>[0], 'randomizer' | 'ocwPool'>, n?: number, courses?: number) => {
  const plan = planOcw({ ...input, randomizer: 'ocw' })
  return draw({ ...input, randomizer: 'ocw', ocwPool: poolFor(plan, n, courses) })
}
{
  // The plan is deterministic, and the draw reproduces it from the same seed.
  const plan = planOcw({ randomizer: 'ocw', seed: 7, now: NOW })
  assert.deepEqual(plan, planOcw({ randomizer: 'ocw', seed: 7, now: NOW }))
  assert.equal(plan.topic.field, plan.field.id)
  assert.ok(plan.u >= 0 && plan.u < 1)
  assert.deepEqual(plan.query, { topic: plan.topic.name, kind: plan.kind.name, courseId: null })
  const a = draw({ randomizer: 'ocw', seed: 7, now: NOW, ocwPool: poolFor(plan) })
  assert.deepEqual(a, draw({ randomizer: 'ocw', seed: 7, now: NOW, ocwPool: poolFor(plan) }))
  const p = a.picks as OcwPicks
  assert.equal(p.field, plan.field.id)
  assert.equal(p.topic, plan.topic.id)
  assert.equal(p.kind, plan.kind.name)
  assert.equal(p.lens, plan.lens.name)
  assert.ok(a.subject.randomizer === 'ocw' && a.subject.file.id === p.fileId && a.subject.course.id === p.courseId)
  assert.ok(a.subject.randomizer === 'ocw' && a.subject.siblings.every((f) => f.courseId === p.courseId && f.id !== p.fileId))
  assert.ok(a.subject.randomizer === 'ocw' && a.subject.pool.count === 3862 && a.subject.pool.pageSize === 30)
  assert.equal(a.primary, a.subject.randomizer === 'ocw' ? a.subject.file.courseReadableId : '')
  assert.ok(a.reels.course && a.reels.resource && a.reels.kind.sub)
  assert.ok(a.rules.some((r) => r.tag === 'pool') && a.rules.some((r) => r.tag === 'licence'))
  for (const r of a.rules) assert.ok(!hasEmDash(r.text), r.text)
  // A pool for another query is refused, so a stale or wrong fetch can never be drawn from.
  const other = planOcw({ randomizer: 'ocw', seed: 8, now: NOW })
  assert.notDeepEqual(other.query, plan.query)
  assert.throws(() => draw({ randomizer: 'ocw', seed: 7, now: NOW, ocwPool: poolFor(other) }), /not the one the plan asked for/)
  // A page with none of the kind is said.
  assert.throws(() => draw({ randomizer: 'ocw', seed: 7, now: NOW, ocwPool: { ...poolFor(plan), files: [] } }), /No .* files on OCW/)
  assert.equal(ocwCourseLabel(a.subject.randomizer === 'ocw' ? a.subject.course : { number: '', title: '', semester: null, year: null }).endsWith('(Fall 2020)'), true)
  assert.ok(ocwCreditLine(a.subject as { course: OcwFile extends never ? never : any }).includes('CC BY-NC-SA 4.0'))
}
{
  // Locks: field, topic, kind and lens keep their values; a course lock narrows the pool to the course; a resource lock keeps the file.
  const first = spinOcw({ seed: 3, now: NOW })
  const fp = first.picks as OcwPicks
  for (let seed = 10; seed < 40; seed++) {
    const kept = spinOcw({ seed, now: NOW, prev: first, locks: ['topic', 'kind', 'lens'] })
    const kp = kept.picks as OcwPicks
    assert.equal(kp.field, fp.field)
    assert.equal(kp.topic, fp.topic)
    assert.equal(kp.kind, fp.kind)
    assert.equal(kp.lens, fp.lens)
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['course'] })
    assert.equal(plan.query.courseId, fp.courseId)
    assert.equal(plan.keepFile, null)
    const course = draw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['course'], ocwPool: poolFor(plan, 12) })
    assert.equal((course.picks as OcwPicks).courseId, fp.courseId)
    const res = planOcw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['resource'] })
    assert.equal(res.keepFile, fp.fileId)
    const pool = poolFor(res, 12)
    pool.files.push(ocwFile(fp.fileId - 1000, fp.courseId, res.query.kind))
    const same = draw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['resource'], ocwPool: pool })
    assert.equal((same.picks as OcwPicks).fileId, fp.fileId)
  }
}
{
  // Balancing: the field is re-drawn once after a repeat; a topic spun in the last 30 days is left out; two reading spins force a hands-on kind.
  const first = spinOcw({ seed: 2, now: NOW })
  let sameField = 0
  const stockedIn = (field: number) => OCW.topics.filter((t) => t.field === field && OCW.kinds.some((k) => t.files[k.name]! > 0)).length
  for (let seed = 0; seed < 400; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, history: [entry(first, 1)] })
    if (plan.field.id === first.meta.field) sameField++
    // The topic block holds unless the field has only that one topic with files (then it lifts, and says so).
    if (plan.field.id === first.meta.field && stockedIn(plan.field.id) > 1) assert.notEqual(plan.topic.id, first.meta.topic, 'topic blocked for 30 days')
  }
  // Without the re-draw a field repeats 1 in 11; one re-draw makes it about 1 in 121.
  assert.ok(sameField < 400 / 30, `field repeated ${sameField} times in 400`)
  const reading = (d: number): SpinHistoryEntry => ({
    status: 'spun',
    primary: `9.000+fall_2020`,
    combo: `x|Lecture Notes|9.000+fall_2020|y`,
    meta: { field: OCW.fields[0]!.id, topic: OCW.topics[0]!.id, kind: 'Lecture Notes' },
    picks: { field: OCW.fields[0]!.id, topic: OCW.topics[0]!.id, kind: 'Lecture Notes', lens: 'The one idea', courseId: 9, fileId: 9 },
    createdAt: daysAgo(d),
  })
  for (let seed = 0; seed < 100; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, history: [reading(2), reading(1)] })
    const canHandsOn = OCW.kinds.some((k) => k.hands_on && plan.topic.files[k.name]! > 0)
    assert.ok(plan.kind.hands_on || !canHandsOn, `quota forces a hands-on kind, got ${plan.kind.name} for ${plan.topic.name}`)
  }
}
{
  // The 30-day block on courses, and the 90-day block on the combination.
  const first = spinOcw({ seed: 5, now: NOW })
  const fp = first.picks as OcwPicks
  for (let seed = 0; seed < 100; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['topic', 'kind'], history: [entry(first, 3)] })
    const r = draw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['topic', 'kind'], history: [entry(first, 3)], ocwPool: poolFor(plan) })
    assert.notEqual((r.picks as OcwPicks).courseId, fp.courseId, 'a course spun in the last 30 days is left out')
    assert.ok(r.rules.some((x) => x.tag === '30 days' && x.kind === 'block'))
  }
  // Every course on the page spun this month: the block lifts, and says so.
  const plan = planOcw({ randomizer: 'ocw', seed: 6, now: NOW, prev: first, locks: ['topic', 'kind'], history: [entry(first, 3)] })
  const onlyThatCourse = { ...poolFor(plan, 10), files: [...Array(10).keys()].map((i) => ocwFile(i, fp.courseId, plan.query.kind)) }
  const lifted = draw({ randomizer: 'ocw', seed: 6, now: NOW, prev: first, locks: ['topic', 'kind'], history: [entry(first, 3)], ocwPool: onlyThatCourse })
  assert.ok(lifted.rules.some((x) => x.tag === '30 days' && x.kind === 'warn'))
  // The combination is blocked for 90 days: with the course locked, the lens changes.
  for (let seed = 0; seed < 60; seed++) {
    const p2 = planOcw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['course', 'kind'], history: [entry(first, 40)] })
    const r = draw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['course', 'kind'], history: [entry(first, 40)], ocwPool: poolFor(p2, 8) })
    assert.notEqual(r.combo, first.combo)
    assert.equal((r.picks as OcwPicks).courseId, fp.courseId)
  }
}
{
  // Sequence mode: the next file of the course in key order; past the end, the first not yet spun; a full course warns.
  const first = spinOcw({ seed: 9, now: NOW })
  const fp = first.picks as OcwPicks
  const plan = planOcw({ randomizer: 'ocw', seed: 1, now: NOW, history: [entry(first, 1)], sequence: true })
  assert.deepEqual(plan.query, { topic: plan.topic.name, kind: fp.kind, courseId: fp.courseId })
  assert.equal(plan.afterFile, fp.fileId)
  const course = poolFor(plan, 5)
  const sorted = [...course.files].sort((a, b) => a.key.localeCompare(b.key))
  course.files.push(ocwFile(fp.fileId - 1000, fp.courseId, fp.kind))
  const prevKey = course.files[course.files.length - 1]!.key
  const next = draw({ randomizer: 'ocw', seed: 1, now: NOW, history: [entry(first, 1)], sequence: true, ocwPool: course })
  const expected = [...course.files].sort((a, b) => a.key.localeCompare(b.key)).find((f) => f.key > prevKey) ?? sorted[0]!
  assert.equal((next.picks as OcwPicks).fileId, expected.id)
  assert.ok(next.subject.randomizer === 'ocw' && next.subject.sequence)
  assert.ok(next.rules.some((x) => x.tag === 'sequence' && x.kind === 'good'))
  // A full course: every file spun, the last in key order most recently.
  const byKey = [...course.files].sort((a, b) => a.key.localeCompare(b.key))
  const all = byKey.map((f, i) => ({ ...entry(next, byKey.length - i), primary: f.courseReadableId, picks: { ...(next.picks as OcwPicks), fileId: f.id } }))
  const done = draw({ randomizer: 'ocw', seed: 1, now: NOW, history: all, sequence: true, ocwPool: course })
  assert.ok(done.rules.some((x) => x.tag === 'sequence' && x.kind === 'warn'))
  // No OCW spin to continue from: a fresh draw.
  const fresh = planOcw({ randomizer: 'ocw', seed: 1, now: NOW, sequence: true })
  assert.equal(fresh.afterFile, null)
  assert.equal(fresh.query.courseId, null)
}

// OCW pool: the hit mapping, the page offset, the enrichment and the loader on a fake API.
{
  const hit: OcwHit = {
    id: 8525629,
    key: 'courses/2-61-internal-combustion-engines-spring-2017/resources/mit2_61s17_ps6/',
    url: 'https://ocw.mit.edu/courses/2-61-internal-combustion-engines-spring-2017/resources/mit2_61s17_ps6/',
    title: 'Internal Combustion Engines, Problem set 6',
    content_type: 'pdf',
    file_type: 'application/pdf',
    content_feature_type: ['Problem Sets'],
    resource_id: '3661',
    resource_readable_id: '2.61+spring_2017',
    run_title: 'Internal Combustion Engines',
    run_slug: 'courses/2-61-internal-combustion-engines-spring-2017',
    course_number: ['2.61'],
    departments: [{ name: 'Mechanical Engineering' }],
    year: 2017,
    semester: 'Spring',
  }
  const f = ocwFileFromHit(hit)!
  assert.equal(f.courseId, 3661)
  assert.equal(f.courseNumber, '2.61')
  assert.equal(f.courseSlug, 'courses/2-61-internal-combustion-engines-spring-2017')
  assert.deepEqual(f.departments, ['Mechanical Engineering'])
  assert.deepEqual(f.kinds, ['Problem Sets'])
  // A bare file name title and a missing course number fall back to the key and the readable id.
  const bare = ocwFileFromHit({ ...hit, title: '', content_title: 'lec15.pdf', course_number: null, run_title: null })!
  assert.equal(bare.title, 'lec15.pdf')
  assert.equal(bare.courseNumber, '2.61')
  assert.equal(bare.courseTitle, '2.61')
  assert.equal(ocwFileFromHit({ ...hit, resource_id: null }), null)
  assert.equal(ocwFileFromHit({ ...hit, key: null }), null)

  assert.equal(ocwPageOffset(0, 3862), 0)
  assert.equal(ocwPageOffset(1, 3862), 3832, 'the last page still fits')
  assert.equal(ocwPageOffset(0.5, 10), 0, 'fewer files than a page: the page starts at 0')
  assert.equal(ocwPageOffset(1, 50000), 10000 - DRAW_RULES.ocwPageSize, 'the search cap holds')
  for (let i = 0; i < 100; i++) {
    const o = ocwPageOffset(i / 100, 3862)
    assert.ok(o >= 0 && o + DRAW_RULES.ocwPageSize <= 3862)
  }

  const course = enrichedOcwCourse(
    { id: 3661, readableId: '2.61+spring_2017', number: '2.61', title: 'x', url: 'u', slug: 's', departments: [], year: 2017, semester: 'Spring', instructors: [], level: [], courseFeatures: [] },
    { id: 3661, title: 'Internal Combustion Engines', url: 'https://ocw.mit.edu/courses/2-61/', course_feature: ['Problem Sets'], runs: [{ instructors: [{ full_name: 'Prof. Wai Cheng' }, { first_name: 'A', last_name: 'B' }], level: [{ name: 'Graduate' }] }] },
  )
  assert.deepEqual(course.instructors, ['Prof. Wai Cheng', 'A B'])
  assert.deepEqual(course.level, ['Graduate'])
  assert.equal(course.title, 'Internal Combustion Engines')

  // The loader: a topic page needs the count then the page at the plan's offset; a course pool pages the course's files.
  // (The file runs as CommonJS, so the async part is collected and awaited at the end.)
  const calls: string[] = []
  const fakeFetch = (async (url: string | URL | Request) => {
    const u = String(url)
    calls.push(u)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (u.includes('/content_file_search/') && u.includes('limit=0')) return json({ count: 3862, results: [] })
    if (u.includes('/content_file_search/')) {
      const offset = Number(new URL(u).searchParams.get('offset'))
      return json({ count: 3862, results: [...Array(30).keys()].map((i) => ({ ...hit, id: offset + i, key: `${hit.key}${i}/` }))})
    }
    if (u.includes('/learning_resources/3661/contentfiles/')) {
      const offset = Number(new URL(u).searchParams.get('offset'))
      const n = Math.max(0, Math.min(100, 130 - offset))
      return json({ count: 130, results: [...Array(n).keys()].map((i) => ({ ...hit, id: 50000 + offset + i, key: `${hit.key}${offset + i}/` })) })
    }
    return new Response('nope', { status: 404 })
  }) as typeof fetch
  const plan = planOcw({ randomizer: 'ocw', seed: 7, now: NOW })
  pending.push(
    (async () => {
      const pool = await loadOcwPool({ ...plan, query: { ...plan.query, kind: 'Problem Sets' } }, { now: NOW, fetch: fakeFetch })
      assert.equal(pool.count, 3862)
      assert.equal(pool.offset, ocwPageOffset(plan.u, 3862))
      assert.equal(pool.files.length, 30)
      assert.equal(calls.length, 2)
      assert.ok(calls[0]!.includes(`topic=${encodeURIComponent(plan.topic.name)}`) && calls[0]!.includes('platform=ocw'))
      assert.ok(calls[1]!.includes(`offset=${pool.offset}`) && calls[1]!.includes(`limit=${DRAW_RULES.ocwPageSize}`))
      calls.length = 0
      const inCourse = await loadOcwPool({ ...plan, query: { topic: plan.topic.name, kind: 'Problem Sets', courseId: 3661 } }, { now: NOW, fetch: fakeFetch })
      assert.equal(inCourse.count, 130)
      assert.equal(inCourse.files.length, 130)
      assert.equal(calls.length, 2)
      await assert.rejects(loadOcwPool({ ...plan, query: { topic: plan.topic.name, kind: 'Problem Sets', courseId: 1 } }, { fetch: fakeFetch }), /HTTP 404/)
    })(),
  )
}

// Stub and brief sections.
const OCW_POOL = poolFor(planOcw({ randomizer: 'ocw', seed: 21, now: NOW }))
for (const randomizer of ['desk', 'atlas', 'epics', 'ocw', 'footshorts', 'viznba'] as const) {
  const spin = asSpin(draw({ randomizer, seed: 21, now: NOW, news: NEWS, nbaNews: NBA, ocwPool: OCW_POOL }))
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

Promise.all(pending).then(
  () => console.log('randomizer: ok'),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
