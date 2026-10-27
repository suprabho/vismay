/** Checks for the shared draw, the research stub and the brief sections.
 *  (run: npx tsx src/draw.test.ts) */
import assert from 'node:assert/strict'
import { ATLAS, DESK, EPICS, FOOTSHORTS, HUNDRED, LANDMARK, OCW, VIZNBA, epicRoute, hundredByRank, hundredEras, isHandsOn, isPhilosophical, isWorkLevel, landmarkStocked, reelPool } from './datasets'
import { DRAW_RULES, draw, normalizeLocks, planLandmark, planOcw } from './draw'
import {
  awardsFromNobel,
  awardsFromSparql,
  booksFromOpenLibrary,
  enrichLandmarkAward,
  enrichedNobelAward,
  laureateFromSparql,
  loadLandmarkAwards,
  loadLandmarkWorks,
  normalizeDoi,
  pickOpenAlexAuthor,
  withUnpaywall,
  workFromNamed,
  workFromOpenAlex,
  type NobelPrizeRow,
  type OpenAlexWork,
  type OpenLibraryDoc,
} from './landmarkPool'
import { commonsFilePage, completeMonths, formatWikidataTime, loadHundredProfile, pageviewWindow, pageviewsFromBody, parsePoint, profileFromSparql } from './hundredPool'
import { enrichedOcwCourse, loadOcwPool, ocwFileFromHit, ocwPageOffset, type OcwHit } from './ocwPool'
import { assignmentSection, deliverablesSection, formatSection, researchAppendix } from './spinBrief'
import { HUNDRED_LENS_METRICS, LANDMARK_LENS_METRICS, OCW_LENS_METRICS, extractHeroInsight, gameSummary, hundredCreditLine, hundredLife, hundredYear, landmarkAwardLabel, landmarkCreditLine, ocwCourseLabel, ocwCreditLine, researchFileName, researchStub } from './stub'
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
  type HundredPicks,
  type HundredProfile,
  type HundredSubject,
  type LandmarkAward,
  type LandmarkPicks,
  type LandmarkPlan,
  type LandmarkPool,
  type LandmarkSubject,
  type LandmarkWork,
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
assert.deepEqual(randomizersFor('vizmaya-fyi'), ['desk', 'atlas', 'epics', 'ocw', 'landmark', 'hundred'])
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
assert.deepEqual(OCW.kinds.map((k) => k.name), ['Lecture Notes'], 'the OCW Desk draws lecture notes only, for now')
assert.equal(OCW.lenses.length, 7)
for (const l of OCW.lenses) assert.ok(OCW_LENS_METRICS[l.name]?.length === 3, `${l.name}: no chart metrics`)
for (const t of OCW.topics) for (const k of OCW.kinds) assert.equal(typeof t.files[k.name], 'number', `${t.name}: no count for ${k.name}`)
/** A dataset with several kinds, for the rules that need a choice (the hands-on quota, a kind the topic lacks). */
const OCW_KINDS = {
  ...OCW,
  kinds: [
    { name: 'Lecture Notes', hands_on: false, description: 'notes' },
    { name: 'Readings', hands_on: false, description: 'readings' },
    { name: 'Problem Sets', hands_on: true, description: 'problems' },
    { name: 'Exams', hands_on: true, description: 'exams' },
  ],
  topics: OCW.topics.map((t, i) => ({
    ...t,
    files: { 'Lecture Notes': t.files['Lecture Notes']!, Readings: i % 3 ? 40 : 0, 'Problem Sets': i % 2 ? 25 : 0, Exams: i % 5 ? 10 : 0 },
  })),
}
assert.ok(OCW.topics.some((t) => OCW.kinds.every((k) => t.files[k.name] === 0)), 'the taxonomy records topics with no files')
{
  // The plan never lands on a topic without files, nor on a kind the topic has none of.
  for (let seed = 0; seed < 300; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW })
    assert.ok(plan.topic.files[plan.kind.name]! > 0, `${plan.topic.name} has no ${plan.kind.name}`)
  }
  // With several kinds (a synthetic dataset): a kind the topic has none of is never planned, and a topic
  // with only reading kinds yields the quota.
  const D = { ocw: OCW_KINDS }
  for (let seed = 0; seed < 300; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, datasets: D })
    assert.ok(plan.topic.files[plan.kind.name]! > 0, `${plan.topic.name} has no ${plan.kind.name}`)
  }
  const readingOnly = OCW_KINDS.topics.find((t) => t.files['Lecture Notes']! > 0 && t.files['Problem Sets'] === 0 && t.files.Exams === 0)!
  const prev = { picks: { field: readingOnly.field, topic: readingOnly.id, kind: 'Lecture Notes', lens: 'The one idea', courseId: 1, fileId: 1 } }
  const past = (d: number): SpinHistoryEntry => ({ status: 'spun', primary: 'x', combo: 'x', meta: { kind: 'Readings', topic: 0, field: 0 }, picks: prev.picks, createdAt: daysAgo(d) })
  const plan = planOcw({ randomizer: 'ocw', seed: 5, now: NOW, prev, locks: ['topic'], history: [past(2), past(1)], datasets: D })
  assert.equal(plan.topic.id, readingOnly.id)
  assert.ok(!plan.kind.hands_on && plan.topic.files[plan.kind.name]! > 0)
}
assert.ok(isHandsOn('Problem Sets', OCW_KINDS) && !isHandsOn('Lecture Notes') && !isHandsOn(undefined))
assert.deepEqual(normalizeLocks('ocw', ['resource']), ['field', 'topic', 'course', 'resource'])
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
  assert.ok(a.reels.course && a.reels.resource && a.reels.lens && !a.reels.kind, 'no kind reel while the dataset holds one kind')
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
    const kept = spinOcw({ seed, now: NOW, prev: first, locks: ['topic', 'lens'] })
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
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, history: [reading(2), reading(1)], datasets: { ocw: OCW_KINDS } })
    const canHandsOn = OCW_KINDS.kinds.some((k) => k.hands_on && plan.topic.files[k.name]! > 0)
    assert.ok(plan.kind.hands_on || !canHandsOn, `quota forces a hands-on kind, got ${plan.kind.name} for ${plan.topic.name}`)
  }
  // With one kind in the dataset, every plan is that kind and the quota never fires.
  for (let seed = 0; seed < 50; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, history: [reading(2), reading(1)] })
    assert.equal(plan.kind.name, 'Lecture Notes')
  }
}
{
  // The 30-day block on courses, and the 90-day block on the combination.
  const first = spinOcw({ seed: 5, now: NOW })
  const fp = first.picks as OcwPicks
  for (let seed = 0; seed < 100; seed++) {
    const plan = planOcw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['topic'], history: [entry(first, 3)] })
    const r = draw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['topic'], history: [entry(first, 3)], ocwPool: poolFor(plan) })
    assert.notEqual((r.picks as OcwPicks).courseId, fp.courseId, 'a course spun in the last 30 days is left out')
    assert.ok(r.rules.some((x) => x.tag === '30 days' && x.kind === 'block'))
  }
  // Every course on the page spun this month: the block lifts, and says so.
  const plan = planOcw({ randomizer: 'ocw', seed: 6, now: NOW, prev: first, locks: ['topic'], history: [entry(first, 3)] })
  const onlyThatCourse = { ...poolFor(plan, 10), files: [...Array(10).keys()].map((i) => ocwFile(i, fp.courseId, plan.query.kind)) }
  const lifted = draw({ randomizer: 'ocw', seed: 6, now: NOW, prev: first, locks: ['topic'], history: [entry(first, 3)], ocwPool: onlyThatCourse })
  assert.ok(lifted.rules.some((x) => x.tag === '30 days' && x.kind === 'warn'))
  // The combination is blocked for 90 days: with the course locked, the lens changes.
  for (let seed = 0; seed < 60; seed++) {
    const p2 = planOcw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['course'], history: [entry(first, 40)] })
    const r = draw({ randomizer: 'ocw', seed, now: NOW, prev: first, locks: ['course'], history: [entry(first, 40)], ocwPool: poolFor(p2, 8) })
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

// Landmark Desk: the committed taxonomy, then synthetic awards and works (no network).
assert.equal(LANDMARK.fields.length, 10)
assert.equal(LANDMARK.eras.length, 5)
assert.ok(LANDMARK.prizes.length >= 40)
assert.equal(new Set(LANDMARK.prizes.map((p) => p.id)).size, LANDMARK.prizes.length)
for (const p of LANDMARK.prizes) {
  assert.ok(LANDMARK.fields.some((f) => f.id === p.field), p.id)
  assert.ok(landmarkStocked(p), `${p.id}: no awards in any era`)
  for (const e of LANDMARK.eras) assert.equal(typeof p.awards[e.id], 'number', `${p.id}: no count for ${e.id}`)
  if (p.source.kind === 'nobel') assert.ok(p.work_level && /^Q\d+$/.test(p.source.item), p.id)
  else assert.ok(/^Q\d+$/.test(p.source.item), p.id)
}
for (const f of LANDMARK.fields) assert.ok(LANDMARK.prizes.some((p) => p.field === f.id), `${f.name}: no prizes`)
assert.ok(LANDMARK.prizes.filter((p) => p.work_level).length >= 5, 'the work-level prizes: the Nobels, the Gödel Prize, the book prizes')
assert.ok(isWorkLevel('godel') && isWorkLevel('nobel-physics') && !isWorkLevel('abel') && !isWorkLevel(undefined))
assert.equal(LANDMARK.lenses.length, 7)
for (const l of LANDMARK.lenses) assert.ok(LANDMARK_LENS_METRICS[l.name]?.length === 3, `${l.name}: no chart metrics`)
assert.deepEqual(normalizeLocks('landmark', ['work']), ['field', 'prize', 'era', 'laureate', 'work'])
assert.deepEqual(normalizeLocks('landmark', ['era', 'lens']), ['field', 'prize', 'era', 'lens'])
assert.equal(reelPool('landmark', 'field').length, 10)
assert.deepEqual(reelPool('landmark', 'laureate', ['A', 'B']), ['A', 'B'])
assert.throws(() => draw({ randomizer: 'landmark', seed: 1, now: NOW }), /pool/)

/** An award of a prize in a year, for a synthetic pool. */
const lmAward = (prize: string, year: number, i: number, extra: Partial<LandmarkAward> = {}): LandmarkAward => ({
  prize,
  year,
  laureateId: `wd:Q${year}${i}`,
  name: `Laureate ${year}-${i}`,
  wikidata: `Q${year}${i}`,
  nobelId: null,
  motivation: `for work ${year}-${i}`,
  share: null,
  coLaureates: [],
  namedWorks: [],
  url: `https://www.wikidata.org/wiki/Q${year}${i}`,
  links: {},
  orcid: null,
  openalexId: null,
  openLibraryId: null,
  ...extra,
})
/** The awards of a plan's prize and era: two laureates a year, every third year. */
const lmAwardsFor = (plan: LandmarkPlan): LandmarkAward[] => {
  const out: LandmarkAward[] = []
  const to = Math.min(plan.era.to, 2026)
  for (let y = Math.max(plan.era.from, plan.prize.since); y <= to; y += 3) for (let i = 1; i <= 2; i++) out.push(lmAward(plan.prize.id, y, i))
  for (const a of out) a.coLaureates = out.filter((b) => b.year === a.year && b !== a).map((b) => b.name)
  return out
}
const lmWork = (id: string, basis: LandmarkWork['basis'], extra: Partial<LandmarkWork> = {}): LandmarkWork => ({
  id,
  title: `Work ${id}`,
  year: 1999,
  doi: `10.1000/${id}`,
  url: `https://doi.org/10.1000/${id}`,
  oaUrl: null,
  oaStatus: 'closed',
  venue: 'Journal',
  authors: ['A'],
  citedBy: 100,
  fwci: 2,
  topOnePercent: false,
  countsByYear: [{ year: 2020, citations: 5 }],
  type: 'article',
  retracted: false,
  basis,
  representative: basis !== 'citation',
  ...extra,
})
const lmPoolFor = (plan: LandmarkPlan, awards: LandmarkAward[], works: LandmarkWork[] = [lmWork('w1', 'top-cited'), lmWork('w2', 'top-cited', { oaUrl: 'https://x/pdf', oaStatus: 'green' })]): LandmarkPool => ({
  asOf: NOW.toISOString(),
  query: plan.query,
  awards,
  works: plan.award ? { laureateId: plan.award.laureateId, items: works, sources: { wikidata: 'ok', openalex: 'ok', openlibrary: 'skipped', unpaywall: 'no email', errors: [], notes: [] } } : null,
})
const spinLandmark = (input: Omit<Parameters<typeof draw>[0], 'randomizer' | 'landmarkPool'>, works?: LandmarkWork[]) => {
  const first = planLandmark({ ...input, randomizer: 'landmark' })
  const awards = lmAwardsFor(first)
  const plan = planLandmark({ ...input, randomizer: 'landmark' }, awards)
  return draw({ ...input, randomizer: 'landmark', landmarkPool: lmPoolFor(plan, awards, works) })
}
{
  // The plan is deterministic in both stages, and the draw reproduces it from the same seed.
  const plan = planLandmark({ randomizer: 'landmark', seed: 7, now: NOW })
  assert.deepEqual(plan, planLandmark({ randomizer: 'landmark', seed: 7, now: NOW }))
  assert.equal(plan.award, null)
  assert.equal(plan.prize.field, plan.field.id)
  assert.ok(landmarkStocked(plan.prize, plan.era.id), 'the plan only asks for a stocked prize and era')
  assert.deepEqual(plan.query, { prize: plan.prize.id, era: plan.era.id })
  const awards = lmAwardsFor(plan)
  const planned = planLandmark({ randomizer: 'landmark', seed: 7, now: NOW }, awards)
  assert.deepEqual({ ...planned, award: null }, plan, 'the second pass repeats the first')
  assert.ok(planned.award && awards.includes(planned.award))
  const a = draw({ randomizer: 'landmark', seed: 7, now: NOW, landmarkPool: lmPoolFor(planned, awards) })
  assert.deepEqual(a, draw({ randomizer: 'landmark', seed: 7, now: NOW, landmarkPool: lmPoolFor(planned, awards) }))
  const p = a.picks as LandmarkPicks
  assert.equal(p.prize, plan.prize.id)
  assert.equal(p.era, plan.era.id)
  assert.equal(p.lens, plan.lens.name)
  assert.equal(p.laureateId, planned.award!.laureateId)
  assert.equal(a.primary, p.laureateId)
  assert.ok(a.subject.randomizer === 'landmark' && a.subject.award.laureateId === p.laureateId && a.subject.work?.id === p.workId)
  assert.ok(a.subject.randomizer === 'landmark' && a.subject.related.length === 1 && a.subject.pool.count === awards.length)
  assert.ok(a.reels.field && a.reels.prize && a.reels.era && a.reels.laureate && a.reels.work && a.reels.lens)
  assert.ok(a.rules.some((r) => r.tag === 'pool') && a.rules.some((r) => r.tag === 'licence') && a.rules.some((r) => r.tag === 'work' && r.kind === 'warn'), 'a top-cited work is flagged as representative')
  for (const r of a.rules) assert.ok(!hasEmDash(r.text), r.text)
  assert.ok(a.summary.includes(planned.award!.name) && a.summary.includes(String(planned.award!.year)))
  assert.deepEqual(a.meta, { fieldId: plan.field.id, prize: plan.prize.id, workLevel: plan.prize.work_level })
  // A pool for another query, or works for another laureate, is refused.
  const other = planLandmark({ randomizer: 'landmark', seed: 8, now: NOW })
  assert.notDeepEqual(other.query, plan.query)
  assert.throws(() => draw({ randomizer: 'landmark', seed: 7, now: NOW, landmarkPool: lmPoolFor({ ...planned, query: other.query }, awards) }), /not the one the plan asked for/)
  assert.throws(() => draw({ randomizer: 'landmark', seed: 7, now: NOW, landmarkPool: { ...lmPoolFor(planned, awards), works: null } }), /works in the pool/)
  // No awards in the era is said.
  assert.throws(() => planLandmark({ randomizer: 'landmark', seed: 7, now: NOW }, []), /No .* awards between/)
  // No work at all: the spin stands, with a warning and a null work.
  const bare = draw({ randomizer: 'landmark', seed: 7, now: NOW, landmarkPool: lmPoolFor(planned, awards, []) })
  assert.ok(bare.subject.randomizer === 'landmark' && bare.subject.work === null && (bare.picks as LandmarkPicks).workId === null)
  assert.ok(bare.rules.some((r) => r.tag === 'work' && r.kind === 'warn' && /reconstruct/.test(r.text)))
  assert.equal(landmarkAwardLabel(plan.prize, 2001), `${plan.prize.name} 2001`)
  assert.ok(landmarkCreditLine(a.subject as LandmarkSubject).includes('CC0'))
}
{
  // The work tiers: what the award names first, then a notable work, then the top-cited (or, for a book prize, the book); retracted works out; free copies weighted up.
  const plan0 = planLandmark({ randomizer: 'landmark', seed: 3, now: NOW })
  const awards = lmAwardsFor(plan0)
  const plan = planLandmark({ randomizer: 'landmark', seed: 3, now: NOW }, awards)
  const spin = (works: LandmarkWork[]) => draw({ randomizer: 'landmark', seed: 3, now: NOW, landmarkPool: lmPoolFor(plan, awards, works) })
  const named = spin([lmWork('t', 'top-cited', { citedBy: 9000 }), lmWork('n', 'notable'), lmWork('c', 'citation')])
  assert.equal((named.picks as LandmarkPicks).workId, 'c')
  assert.ok(named.rules.some((r) => r.tag === 'work' && r.kind === 'good'))
  assert.ok(named.subject.randomizer === 'landmark' && !named.subject.work!.representative)
  const notable = spin([lmWork('t', 'top-cited'), lmWork('n', 'notable')])
  assert.equal((notable.picks as LandmarkPicks).workId, 'n')
  const subject = spin([lmWork('s', 'citation', { type: 'subject', doi: null, year: null }), lmWork('t', 'top-cited')])
  assert.equal((subject.picks as LandmarkPicks).workId, 't', 'a named subject (a theory) stands in only when no publication was found')
  const onlySubject = spin([lmWork('s', 'citation', { type: 'subject', doi: null, year: null })])
  assert.equal((onlySubject.picks as LandmarkPicks).workId, 's')
  assert.ok(onlySubject.rules.some((r) => r.tag === 'work' && r.kind === 'warn' && /as a subject/.test(r.text)))
  const retracted = spin([lmWork('r', 'citation', { retracted: true }), lmWork('t', 'top-cited')])
  assert.equal((retracted.picks as LandmarkPicks).workId, 't')
  assert.ok(retracted.rules.some((r) => r.tag === 'retracted' && r.kind === 'block'))
  let free = 0
  for (let seed = 0; seed < 300; seed++) {
    const p = planLandmark({ randomizer: 'landmark', seed, now: NOW }, lmAwardsFor(planLandmark({ randomizer: 'landmark', seed, now: NOW })))
    const r = draw({ randomizer: 'landmark', seed, now: NOW, landmarkPool: lmPoolFor(p, lmAwardsFor(p), [lmWork('closed', 'top-cited'), lmWork('open', 'top-cited', { oaUrl: 'https://x', oaStatus: 'gold' })]) })
    if ((r.picks as LandmarkPicks).workId === 'open') free++
  }
  assert.ok(free > 180 && free < 270, `the free copy was drawn ${free} times in 300 (3 to 1 is about 225)`)
  // A book prize prefers the book over a top-cited paper.
  const bookPrize = LANDMARK.prizes.find((p) => p.works === 'book')!
  const bookData = { landmark: { ...LANDMARK, prizes: LANDMARK.prizes.filter((p) => p.field === bookPrize.field) } }
  let sawBook = false
  for (let seed = 0; seed < 40 && !sawBook; seed++) {
    const p0 = planLandmark({ randomizer: 'landmark', seed, now: NOW, datasets: bookData })
    if (p0.prize.id !== bookPrize.id) continue
    const aw = lmAwardsFor(p0)
    const p1 = planLandmark({ randomizer: 'landmark', seed, now: NOW, datasets: bookData }, aw)
    const r = draw({ randomizer: 'landmark', seed, now: NOW, datasets: bookData, landmarkPool: lmPoolFor(p1, aw, [lmWork('t', 'top-cited'), lmWork('b', 'book', { doi: null, type: 'book' })]) })
    assert.equal((r.picks as LandmarkPicks).workId, 'b')
    sawBook = true
  }
  assert.ok(sawBook)
}
{
  // Locks: field, prize, era, lens keep their values; a laureate lock keeps the laureate; a work lock keeps the work.
  const first = spinLandmark({ seed: 11, now: NOW })
  const fp = first.picks as LandmarkPicks
  for (let seed = 20; seed < 50; seed++) {
    const kept = spinLandmark({ seed, now: NOW, prev: first, locks: ['era', 'lens'] })
    const kp = kept.picks as LandmarkPicks
    assert.equal(kp.field, fp.field)
    assert.equal(kp.prize, fp.prize)
    assert.equal(kp.era, fp.era)
    assert.equal(kp.lens, fp.lens)
    const laureate = planLandmark({ randomizer: 'landmark', seed, now: NOW, prev: first, locks: ['laureate'] })
    assert.equal(laureate.keepLaureate, fp.laureateId)
    const planned = planLandmark({ randomizer: 'landmark', seed, now: NOW, prev: first, locks: ['laureate'] }, lmAwardsFor(laureate))
    assert.equal(planned.award?.laureateId, fp.laureateId)
    const work = planLandmark({ randomizer: 'landmark', seed, now: NOW, prev: first, locks: ['work'] }, lmAwardsFor(laureate))
    assert.equal(work.keepWork, fp.workId)
    const same = draw({ randomizer: 'landmark', seed, now: NOW, prev: first, locks: ['work'], landmarkPool: lmPoolFor(work, lmAwardsFor(laureate)) })
    assert.equal((same.picks as LandmarkPicks).workId, fp.workId)
    assert.equal((same.picks as LandmarkPicks).laureateId, fp.laureateId)
  }
}
{
  // Balancing: the field is re-drawn once after a repeat; a prize spun in the last 30 days is left out of its field; the work-level quota.
  const first = spinLandmark({ seed: 2, now: NOW })
  let sameField = 0
  for (let seed = 0; seed < 400; seed++) {
    const plan = planLandmark({ randomizer: 'landmark', seed, now: NOW, history: [entry(first, 1)] })
    if (plan.field.id === first.meta.fieldId) sameField++
    const inField = LANDMARK.prizes.filter((p) => p.field === first.meta.fieldId)
    if (plan.field.id === first.meta.fieldId && inField.length > 1) assert.notEqual(plan.prize.id, first.meta.prize, 'prize blocked for 30 days')
  }
  // Without the re-draw a field repeats 1 in 10; one re-draw makes it about 1 in 100.
  assert.ok(sameField < 400 / 25, `field repeated ${sameField} times in 400`)
  const body = (d: number, prize = 'abel'): SpinHistoryEntry => ({
    status: 'spun',
    primary: `wd:Q1`,
    combo: `${prize}|wd:Q1|x`,
    meta: { fieldId: LANDMARK.prizes.find((p) => p.id === prize)!.field, prize, workLevel: false },
    picks: { field: 'mathematics', prize, era: 'recent', lens: 'Why it won', laureateId: 'wd:Q1', year: 2020, workId: null },
    createdAt: daysAgo(d),
  })
  for (let seed = 0; seed < 100; seed++) {
    const plan = planLandmark({ randomizer: 'landmark', seed, now: NOW, history: [body(2), body(1, 'fields')] })
    assert.ok(plan.prize.work_level, `quota forces a work-level prize, got ${plan.prize.id}`)
  }
  const r = spinLandmark({ seed: 4, now: NOW, history: [body(2), body(1, 'fields')] })
  assert.ok(r.rules.some((x) => x.tag === 'quota'))
  // After a work-level spin the quota rests.
  let nonWorkLevel = 0
  for (let seed = 0; seed < 100; seed++) {
    const plan = planLandmark({ randomizer: 'landmark', seed, now: NOW, history: [body(2), { ...body(1), meta: { ...body(1).meta, prize: 'godel' } }] })
    if (!plan.prize.work_level) nonWorkLevel++
  }
  assert.ok(nonWorkLevel > 0, 'the quota does not fire after a work-level spin')
}
{
  // The 30-day block on laureates, never the same award twice, and the 90-day block on the combination.
  const first = spinLandmark({ seed: 5, now: NOW })
  const fp = first.picks as LandmarkPicks
  for (let seed = 0; seed < 60; seed++) {
    const input = { seed, now: NOW, prev: first, locks: ['era'], history: [entry(first, 3)] }
    const plan = planLandmark({ ...input, randomizer: 'landmark' })
    // The first laureate won the same prize a second time, in another year: that award is in the pool but blocked too.
    const twice = lmAward(plan.prize.id, plan.era.from, 7, { laureateId: fp.laureateId, name: 'Twice Laureate' })
    const awards = [...lmAwardsFor(plan).filter((a) => a.year !== plan.era.from || a.laureateId === fp.laureateId), twice]
    const planned = planLandmark({ ...input, randomizer: 'landmark' }, awards)
    assert.notEqual(planned.award!.laureateId, fp.laureateId, 'a laureate spun in the last 30 days is left out')
    const r = draw({ ...input, randomizer: 'landmark', landmarkPool: lmPoolFor(planned, awards) })
    assert.ok(r.rules.some((x) => x.tag === '30 days' && x.kind === 'block' && x.text.includes('Twice Laureate')))
  }
  // Every award of the era spun this month: the block lifts, and says so.
  const plan = planLandmark({ randomizer: 'landmark', seed: 6, now: NOW, prev: first, locks: ['era'], history: [entry(first, 3)] })
  const only = [lmAward(plan.prize.id, plan.era.from, 9, { laureateId: fp.laureateId })]
  const lifted = planLandmark({ randomizer: 'landmark', seed: 6, now: NOW, prev: first, locks: ['era'], history: [entry(first, 3)] }, only)
  assert.equal(lifted.award?.laureateId, fp.laureateId)
  // The combination is blocked for 90 days: with the laureate locked, the lens changes.
  for (let seed = 0; seed < 60; seed++) {
    const input = { seed, now: NOW, prev: first, locks: ['laureate'], history: [entry(first, 40)] }
    const p = planLandmark({ ...input, randomizer: 'landmark' })
    const awards = lmAwardsFor(p)
    const planned = planLandmark({ ...input, randomizer: 'landmark' }, awards)
    const r = draw({ ...input, randomizer: 'landmark', landmarkPool: lmPoolFor(planned, awards) })
    assert.notEqual(r.combo, first.combo)
    assert.equal((r.picks as LandmarkPicks).laureateId, fp.laureateId)
  }
}
{
  // Sequence mode: the same prize, the year before; past the prize's start, the walk begins again and says so.
  const first = spinLandmark({ seed: 9, now: NOW })
  const fp = first.picks as LandmarkPicks
  const plan = planLandmark({ randomizer: 'landmark', seed: 1, now: NOW, history: [entry(first, 1)], sequence: true })
  assert.equal(plan.prize.id, fp.prize)
  assert.equal(plan.beforeYear, fp.year)
  assert.ok(plan.era.from <= fp.year - 1 || plan.era.id === fp.era)
  const awards = lmAwardsFor(plan)
  const planned = planLandmark({ randomizer: 'landmark', seed: 1, now: NOW, history: [entry(first, 1)], sequence: true }, awards)
  const earlier = awards.filter((a) => a.year < fp.year)
  if (earlier.length) {
    assert.equal(planned.award!.year, Math.max(...earlier.map((a) => a.year)))
    const next = draw({ randomizer: 'landmark', seed: 1, now: NOW, history: [entry(first, 1)], sequence: true, landmarkPool: lmPoolFor(planned, awards) })
    assert.ok(next.subject.randomizer === 'landmark' && next.subject.sequence)
    assert.ok(next.rules.some((x) => x.tag === 'sequence' && x.kind === 'good'))
  }
  // At the start of the prize: the walk starts again from the era's newest year, with a warning.
  const start = { ...first, picks: { ...fp, year: plan.prize.since }, meta: first.meta }
  const again = planLandmark({ randomizer: 'landmark', seed: 1, now: NOW, history: [entry(start, 1)], sequence: true })
  if (again.beforeYear !== null) {
    const aw = lmAwardsFor(again).filter((a) => a.year >= plan.prize.since)
    const wrapped = planLandmark({ randomizer: 'landmark', seed: 1, now: NOW, history: [entry(start, 1)], sequence: true }, aw)
    assert.equal(wrapped.award!.year, Math.max(...aw.map((a) => a.year)))
  }
  // No Landmark spin to continue from: a fresh draw.
  const fresh = planLandmark({ randomizer: 'landmark', seed: 1, now: NOW, sequence: true })
  assert.equal(fresh.beforeYear, null)
}

// Landmark pool: the mappings on recorded responses, and the loaders on a fake API.
{
  const physics = LANDMARK.prizes.find((p) => p.id === 'nobel-physics')!
  const godel = LANDMARK.prizes.find((p) => p.id === 'godel')!
  const wolfson = LANDMARK.prizes.find((p) => p.id === 'wolfson')!
  const era = LANDMARK.eras.find((e) => e.id === 'recent')!
  const nobelRows: NobelPrizeRow[] = [
    {
      awardYear: '2019',
      topMotivation: { en: 'for contributions to our understanding of the evolution of the universe' },
      laureates: [
        { id: '973', knownName: { en: 'James Peebles' }, portion: '1/2', motivation: { en: 'for theoretical discoveries in physical cosmology' } },
        { id: '974', knownName: { en: 'Michel Mayor' }, portion: '1/4', motivation: { en: 'for the discovery of an exoplanet orbiting a solar-type star' } },
        { id: '975', knownName: { en: 'Didier Queloz' }, portion: '1/4', motivation: { en: 'for the discovery of an exoplanet orbiting a solar-type star' } },
      ],
    },
    { awardYear: '2020', laureates: [{ id: '988', knownName: { en: 'Roger Penrose' }, portion: '1/2', motivation: { en: 'for the discovery that black hole formation is a robust prediction of the general theory of relativity' } }] },
    { awardYear: '1942' },
    { awardYear: '2005', laureates: [{ id: '1', fullName: { en: 'Old Laureate' } }] },
  ]
  const awards = awardsFromNobel(nobelRows, physics, era)
  assert.deepEqual(awards.map((a) => a.laureateId), ['nobel:975', 'nobel:973', 'nobel:974', 'nobel:988'], 'in the era, oldest first then by name, no prize-less years')
  const mayor = awards.find((a) => a.name === 'Michel Mayor')!
  assert.deepEqual(mayor.coLaureates, ['James Peebles', 'Didier Queloz'])
  assert.equal(mayor.share, '1/4')
  assert.equal(mayor.links.background, 'https://www.nobelprize.org/prizes/physics/2019/advanced-information/')
  assert.equal(mayor.url, 'https://www.nobelprize.org/laureate/974')
  const penrose = enrichedNobelAward(awards[3]!, physics, { id: '988', fileName: 'penrose', wikidata: { id: 'Q193803' }, wikipedia: { english: 'https://en.wikipedia.org/wiki/Roger_Penrose' } })
  assert.equal(penrose.wikidata, 'Q193803')
  assert.equal(penrose.links.lecture, 'https://www.nobelprize.org/prizes/physics/2020/penrose/lecture/')
  assert.equal(penrose.links.wikipedia, 'https://en.wikipedia.org/wiki/Roger_Penrose')

  const wdRow = (person: string, label: string, date: string, extra: Record<string, string> = {}) =>
    Object.fromEntries(
      Object.entries({ person: `http://www.wikidata.org/entity/${person}`, personLabel: label, date, ...extra }).map(([k, v]) => [k, { value: v }]),
    )
  const sparqlRows = [
    wdRow('Q41031593', 'Ronald de Wolf', '2023-01-01T00:00:00Z', { orcid: '0000-0001-9586-0799', article: 'https://en.wikipedia.org/wiki/Ronald_de_Wolf' }),
    wdRow('Q55439598', 'Thomas Rothvoss', '2023-01-01T00:00:00Z', { work: 'http://www.wikidata.org/entity/Q99', workLabel: 'Exponential lower bounds for polytopes', doi: 'https://doi.org/10.1145/2716307', pub: '2015-01-01T00:00:00Z' }),
    wdRow('Q55439598', 'Thomas Rothvoss', '2023-01-01T00:00:00Z', { openalex: 'A5012345678', ol: 'OL1A' }),
    wdRow('Q19597281', 'Craig Gentry', '2022-01-01T00:00:00Z'),
    wdRow('Q1', 'Too Early', '2009-01-01T00:00:00Z'),
  ]
  const godelAwards = awardsFromSparql(sparqlRows, godel, era)
  assert.deepEqual(godelAwards.map((a) => [a.year, a.name]), [[2022, 'Craig Gentry'], [2023, 'Ronald de Wolf'], [2023, 'Thomas Rothvoss']])
  const rothvoss = godelAwards[2]!
  assert.equal(rothvoss.laureateId, 'wd:Q55439598')
  assert.equal(rothvoss.openalexId, 'A5012345678')
  assert.equal(rothvoss.openLibraryId, 'OL1A')
  assert.deepEqual(rothvoss.coLaureates, ['Ronald de Wolf'])
  assert.deepEqual(rothvoss.namedWorks, [{ id: 'wd:Q99', title: 'Exponential lower bounds for polytopes', doi: '10.1145/2716307', isbn: null, year: 2015, basis: 'citation' }])
  assert.equal(godelAwards[1]!.orcid, '0000-0001-9586-0799')
  assert.equal(godelAwards[1]!.links.wikipedia, 'https://en.wikipedia.org/wiki/Ronald_de_Wolf')
  const laureate = laureateFromSparql([
    { orcid: { value: '0000-0002-0000-0000' }, notable: { value: 'http://www.wikidata.org/entity/Q7' }, notableLabel: { value: 'A Book' }, notableIsbn: { value: '978-0' }, notablePub: { value: '1990-01-01T00:00:00Z' } },
    { forWork: { value: 'http://www.wikidata.org/entity/Q7' }, forWorkLabel: { value: 'A Book' } },
  ])
  assert.equal(laureate.orcid, '0000-0002-0000-0000')
  assert.deepEqual(laureate.named, [{ id: 'wd:Q7', title: 'A Book', doi: null, isbn: null, year: null, basis: 'citation' }], 'a work both named and notable keeps its citation basis')

  assert.equal(normalizeDoi('https://doi.org/10.1103/PhysRevLett.116.061102'), '10.1103/physrevlett.116.061102')
  assert.equal(normalizeDoi('doi:10.1145/2716307'), '10.1145/2716307')
  assert.equal(normalizeDoi('not a doi'), null)
  const ligo: OpenAlexWork = {
    id: 'https://openalex.org/W2252795400',
    doi: 'https://doi.org/10.1103/physrevlett.116.061102',
    title: 'Observation of Gravitational Waves from a Binary Black Hole Merger',
    publication_year: 2016,
    cited_by_count: 14206,
    fwci: 815.2475,
    citation_normalized_percentile: { is_in_top_1_percent: true },
    open_access: { is_oa: true, oa_status: 'hybrid', oa_url: 'http://link.aps.org/pdf/10.1103/PhysRevLett.116.061102' },
    is_retracted: false,
    type: 'article',
    primary_location: { landing_page_url: 'https://doi.org/10.1103/physrevlett.116.061102', source: { display_name: 'Physical Review Letters' } },
    authorships: [{ author: { display_name: 'B. P. Abbott' } }, { author: { display_name: 'R. Abbott' } }, { raw_author_name: 'T. D. Abbott' }, { author: { display_name: 'M. R. Abernathy' } }, { author: { display_name: 'F. Acernese' } }],
    counts_by_year: [{ year: 2025, cited_by_count: 900 }, { year: 2024, cited_by_count: 1100 }],
  }
  const w = workFromOpenAlex(ligo, 'top-cited')!
  assert.equal(w.id, 'openalex:W2252795400')
  assert.equal(w.doi, '10.1103/physrevlett.116.061102')
  assert.equal(w.url, 'https://doi.org/10.1103/physrevlett.116.061102')
  assert.equal(w.oaStatus, 'hybrid')
  assert.equal(w.fwci, 815.25)
  assert.equal(w.topOnePercent, true)
  assert.deepEqual(w.authors, ['B. P. Abbott', 'R. Abbott', 'T. D. Abbott', 'M. R. Abernathy', 'et al.'])
  assert.deepEqual(w.countsByYear, [{ year: 2024, citations: 1100 }, { year: 2025, citations: 900 }])
  assert.ok(w.representative)
  assert.equal(workFromOpenAlex({ id: 'https://openalex.org/W1' }, 'citation'), null, 'no title, no work')
  const named = workFromNamed({ id: 'wd:Q99', title: 'T', doi: '10.1/x', isbn: null, year: 2000, basis: 'citation' })
  assert.equal(named.url, 'https://doi.org/10.1/x')
  assert.ok(!named.representative && named.type === null)
  assert.equal(workFromNamed({ id: 'wd:Q11351276', title: 'Weinberg-Salam theory', doi: null, isbn: null, year: null, basis: 'citation' }).type, 'subject')
  assert.deepEqual(pickOpenAlexAuthor([{ id: 'https://openalex.org/A1', display_name: 'R. Penrose', cited_by_count: 9 }, { id: 'https://openalex.org/A2', display_name: 'Roger Penrose', cited_by_count: 5 }], 'Roger Penrose'), { id: 'A2', exact: true })
  assert.deepEqual(pickOpenAlexAuthor([{ id: 'https://openalex.org/A1', display_name: 'R. Penrose', cited_by_count: 9 }, { id: 'https://openalex.org/A2', display_name: 'Penrose R', cited_by_count: 5 }], 'Roger Penrose'), { id: 'A1', exact: false })
  assert.equal(pickOpenAlexAuthor([], 'x'), null)

  const olDocs: OpenLibraryDoc[] = [
    { key: '/works/OL17635697W', title: 'Martin Luther', first_publish_year: 2012, author_name: ['Lyndal Roper'], author_key: ['OL1A'], publisher: ['Random House'] },
    { key: '/works/OL3907270W', title: 'Witch craze', first_publish_year: 2004, author_name: ['Lyndal Roper'], author_key: ['OL1A'], publisher: ['Yale University Press'] },
    { key: '/works/OL1W', title: 'Summer of Fire and Blood', first_publish_year: 2025, author_name: ['Lyndal Roper'], author_key: ['OL1A'] },
    { key: '/works/OL2W', title: 'Someone Else', first_publish_year: 2025, author_name: ['Other Roper'], author_key: ['OL2A'] },
    { key: '/works/OL4W', title: 'Essays for Lyndal', first_publish_year: 2013, author_name: ['Roper, Lyndal'], author_key: ['OL1A'] },
    { key: '/works/OL3W', title: 'Later', first_publish_year: 2030, author_name: ['Lyndal Roper'], author_key: ['OL1A'] },
  ]
  const books = booksFromOpenLibrary(olDocs, { name: 'Lyndal Roper', year: 2026, openLibraryId: 'OL1A', namedWorks: [{ id: 'wd:Q1', title: 'Summer of Fire and Blood', doi: null, isbn: null, year: 2025, basis: 'citation' }] })
  assert.deepEqual(books.map((b) => b.id), ['ol:OL1W'], 'the book from the four years to the prize, by the laureate alone')
  assert.equal(books[0]!.basis, 'citation', 'a named title keeps the citation basis')
  assert.equal(books[0]!.url, 'https://openlibrary.org/works/OL1W')
  const byName = booksFromOpenLibrary(olDocs, { name: 'Lyndal Roper', year: 2014, openLibraryId: null, namedWorks: [] })
  assert.deepEqual(byName.map((b) => [b.id, b.basis, b.representative]), [['ol:OL4W', 'book', true], ['ol:OL17635697W', 'book', true]], 'the whole name, in any order; the year before the prize first')
  const older = booksFromOpenLibrary(olDocs, { name: 'Lyndal Roper', year: 2008, openLibraryId: 'OL1A', namedWorks: [] })
  assert.deepEqual(older.map((b) => b.id), ['ol:OL3907270W'], 'nothing in the window: the newest earlier book')
  const up = withUnpaywall(w, { is_oa: true, oa_status: 'green', best_oa_location: { url: 'https://arxiv.org/abs/1602.03837', url_for_pdf: 'https://arxiv.org/pdf/1602.03837' } })
  assert.equal(up.oaUrl, 'https://arxiv.org/pdf/1602.03837')
  assert.equal(up.oaStatus, 'green')
  assert.equal(withUnpaywall(w, null), w)
  assert.equal(withUnpaywall(w, { is_oa: false, oa_status: 'closed', best_oa_location: null }).oaUrl, null)

  // The loaders on a fake API: the Nobel awards, the Wikidata awards, then the works with and without the OpenAlex key, a book prize, Unpaywall with an email.
  const calls: string[] = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fakeFetch = (async (url: string | URL | Request) => {
    const u = String(url)
    calls.push(u)
    const host = new URL(u).host
    if (host === 'api.nobelprize.org' && u.includes('/nobelPrizes?')) return json({ nobelPrizes: nobelRows })
    if (host === 'api.nobelprize.org' && u.includes('/laureate/988')) return json([{ id: '988', fileName: 'penrose', wikidata: { id: 'Q193803' } }])
    if (host === 'query.wikidata.org') {
      const query = decodeURIComponent(new URL(u).searchParams.get('query') ?? '')
      if (query.includes('p:P166 ?st . ?st ps:P166 wd:Q1417143')) return json({ results: { bindings: sparqlRows } })
      if (query.includes('VALUES ?person { wd:Q193803 }')) return json({ results: { bindings: [{ orcid: { value: '0000-0001-0000-0000' } }] } })
      if (query.includes('VALUES ?person { wd:Q55439598 }')) return json({ results: { bindings: [] } })
      return json({ results: { bindings: [] } })
    }
    if (host === 'api.openalex.org') {
      if (u.includes('/works/doi:')) return u.includes('2716307') ? json({ ...ligo, id: 'https://openalex.org/W99', doi: 'https://doi.org/10.1145/2716307', title: 'Exponential lower bounds for polytopes' }) : json({}, 404)
      if (u.includes('/authors/orcid:')) return u.includes('api_key=') ? json({ id: 'https://openalex.org/A7', display_name: 'Roger Penrose' }) : json({ error: 'budget' }, 429)
      if (u.includes('/authors?')) return json({ results: [{ id: 'https://openalex.org/A8', display_name: 'Thomas Rothvoss', cited_by_count: 1 }] })
      if (u.includes('/works?')) {
        if (!u.includes('api_key=')) return json({ error: 'budget' }, 429)
        return json({ results: [ligo, { ...ligo, id: 'https://openalex.org/W2', doi: null, title: 'Retracted one', is_retracted: true }] })
      }
    }
    if (host === 'openlibrary.org') return json({ docs: olDocs })
    if (host === 'api.unpaywall.org') return u.includes('2716307') ? json({ is_oa: true, oa_status: 'green', best_oa_location: { url: 'https://repo/x' } }) : json({}, 404)
    return new Response('nope', { status: 404 })
  }) as typeof fetch
  const noKey = { openalexKey: null, email: null }
  const withKey = { openalexKey: 'k', email: 'desk@example.org' }
  pending.push(
    (async () => {
      const plan = { prize: physics, era, query: { prize: 'nobel-physics', era: 'recent' } }
      const pool = await loadLandmarkAwards(plan, { now: NOW, fetch: fakeFetch })
      assert.equal(pool.awards.length, 4)
      assert.equal(pool.works, null)
      assert.ok(calls[0]!.includes('nobelPrizeCategory=phy') && calls[0]!.includes('nobelPrizeYear=2010') && calls[0]!.includes('yearTo=2026'))
      const enriched = await enrichLandmarkAward(pool.awards[3]!, physics, { fetch: fakeFetch })
      assert.equal(enriched.wikidata, 'Q193803')
      // Without a key: the Wikidata record is read, OpenAlex's list calls are skipped and said, nothing else is found, Open Library is tried as the last resort.
      calls.length = 0
      const bare = await loadLandmarkWorks(enriched, physics, { fetch: fakeFetch, env: noKey })
      assert.equal(bare.laureateId, 'nobel:988')
      assert.equal(bare.sources.wikidata, 'ok')
      assert.equal(bare.sources.openalex, 'no key')
      assert.equal(bare.sources.openlibrary, 'ok')
      assert.equal(bare.sources.unpaywall, 'skipped')
      assert.ok(!calls.some((c) => c.includes('api.openalex.org')), 'no OpenAlex call without a key and without a DOI')
      // With a key: the ORCID resolves the author, the top-cited works come back (the retracted one included, flagged), Unpaywall runs on the DOIs.
      calls.length = 0
      const full = await loadLandmarkWorks(enriched, physics, { fetch: fakeFetch, env: withKey })
      assert.equal(full.sources.openalex, 'ok')
      assert.equal(full.sources.unpaywall, 'ok')
      assert.deepEqual(full.items.map((w) => [w.basis, w.retracted]), [['top-cited', false], ['top-cited', true]])
      assert.ok(calls.some((c) => c.includes('/authors/orcid:0000-0001-0000-0000') && c.includes('api_key=k') && c.includes('mailto=desk%40example.org')))
      assert.ok(calls.map(decodeURIComponent).some((c) => c.includes('authorships.author.id:A7') && c.includes('to_publication_date:2020-12-31')))
      assert.ok(calls.some((c) => c.includes('api.unpaywall.org') && c.includes('email=desk%40example.org')))
      // A Wikidata prize: the awards come from SPARQL; a named work with a DOI is looked up on OpenAlex for free, and Unpaywall's link wins.
      calls.length = 0
      const godelPool = await loadLandmarkAwards({ prize: godel, era, query: { prize: 'godel', era: 'recent' } }, { now: NOW, fetch: fakeFetch })
      assert.equal(godelPool.awards.length, 3)
      assert.ok(calls[0]!.includes('query.wikidata.org') && decodeURIComponent(calls[0]!).includes('wd:Q1417143') && decodeURIComponent(calls[0]!).includes('YEAR(?date) >= 2010'))
      const roth = godelPool.awards.find((a) => a.name === 'Thomas Rothvoss')!
      const named = await loadLandmarkWorks(roth, godel, { fetch: fakeFetch, env: { openalexKey: null, email: 'desk@example.org' } })
      assert.equal(named.items.length, 1)
      assert.equal(named.items[0]!.basis, 'citation')
      assert.equal(named.items[0]!.title, 'Exponential lower bounds for polytopes')
      assert.equal(named.items[0]!.oaUrl, 'https://repo/x')
      assert.equal(named.items[0]!.oaStatus, 'green')
      assert.equal(named.sources.openalex, 'ok', 'a DOI lookup needs no key')
      assert.equal(named.sources.openlibrary, 'skipped')
      // A book prize reads Open Library whatever else it found.
      const wolfsonAward = lmAward('wolfson', 2026, 1, { name: 'Lyndal Roper', wikidata: null, openLibraryId: 'OL1A' })
      const books = await loadLandmarkWorks(wolfsonAward, wolfson, { fetch: fakeFetch, env: noKey })
      assert.equal(books.sources.openlibrary, 'ok')
      assert.deepEqual(books.items.map((w) => [w.id, w.basis]), [['ol:OL1W', 'book']])
      assert.ok(books.sources.notes.some((n) => /Open Library/.test(n)))
      // A failed awards read throws (spins.ts answers 503).
      await assert.rejects(loadLandmarkAwards({ prize: physics, era, query: { prize: 'nobel-physics', era: 'recent' } }, { fetch: (async () => new Response('down', { status: 503 })) as typeof fetch }), /HTTP 503/)
      // A failed source in the works read is recorded, never thrown.
      const broken = await loadLandmarkWorks(enriched, physics, { fetch: (async () => new Response('down', { status: 503 })) as typeof fetch, env: withKey })
      assert.equal(broken.sources.wikidata, 'failed')
      assert.equal(broken.sources.openalex, 'failed')
      assert.equal(broken.items.length, 0)
    })(),
  )
}

// The 100 Desk: the committed ranking, then the draw (pure, one pass) and the profile mappings (no network).
{
  assert.equal(HUNDRED.people.length, 100)
  assert.deepEqual(HUNDRED.people.map((p) => p.rank), Array.from({ length: 100 }, (_, i) => i + 1))
  assert.equal(new Set(HUNDRED.people.map((p) => p.id)).size, 100)
  assert.equal(new Set(HUNDRED.people.map((p) => p.wikidata)).size, 100)
  for (const p of HUNDRED.people) {
    assert.match(p.wikidata, /^Q\d+$/, p.name)
    assert.ok(HUNDRED.domains.some((d) => d.id === p.domain), `${p.name}: domain`)
    assert.ok(HUNDRED.eras.some((e) => e.id === p.era), `${p.name}: era`)
    assert.ok(HUNDRED.regions.includes(p.region), `${p.name}: region`)
    if (p.flags.includes('no-portrait') || p.flags.includes('duo') || p.flags.includes('authorship')) assert.ok(p.note, `${p.name}: a flag that needs a note`)
  }
  for (const d of HUNDRED.domains) assert.ok(hundredEras(d.id).length > 0, d.name)
  assert.equal(hundredByRank(1)!.name, 'Muhammad')
  assert.equal(hundredByRank(100)!.name, 'Mahavira')
  assert.ok(hundredByRank(1)!.flags.includes('no-portrait'))
  assert.ok(hundredByRank(31)!.flags.includes('authorship'))
  assert.equal(HUNDRED.lenses.length, Object.keys(HUNDRED_LENS_METRICS).length)
  for (const l of HUNDRED.lenses) assert.ok(HUNDRED_LENS_METRICS[l.name], `metrics for ${l.name}`)
  assert.equal(reelPool('hundred', 'person').length, 100)
  assert.deepEqual(normalizeLocks('hundred', ['person']), ['domain', 'era', 'person'])

  // Years: astronomical in the data, BCE on the page.
  assert.equal(hundredYear(1643), '1643')
  assert.equal(hundredYear(-383), '384 BCE')
  assert.equal(hundredLife({ born: -383, died: -321 }), 'c. 384 BCE to 322 BCE')
  assert.equal(hundredLife({ born: 1643, died: 1727 }), '1643 to 1727')
  assert.equal(hundredLife({ born: null, died: null }), 'dates not on record')
  assert.equal(hundredLife({ born: -500, died: -500 }), 'c. 501 BCE')

  // Determinism; the person sits in the drawn domain and era; the reels and rules say so.
  for (let seed = 0; seed < 60; seed++) {
    const a = draw({ randomizer: 'hundred', seed, now: NOW })
    assert.deepEqual(a, draw({ randomizer: 'hundred', seed, now: NOW }))
    const s = a.subject as HundredSubject
    const p = a.picks as HundredPicks
    assert.equal(s.person.rank, p.rank)
    assert.equal(s.person.domain, p.domain)
    assert.equal(s.person.era, p.era)
    assert.equal(a.primary, s.person.id)
    assert.equal(a.combo, `${s.person.id}|${p.lens}`)
    assert.equal(s.profile, null, 'the profile is read after the draw')
    assert.equal(s.neighbours.above?.rank ?? null, p.rank > 1 ? p.rank - 1 : null)
    assert.ok(a.reels.person!.sub!.startsWith(`#${p.rank} · `))
    assert.ok(a.rules.some((r) => r.tag === 'rank'))
    for (const r of a.rules) assert.ok(!hasEmDash(r.text), r.text)
  }

  // Locks keep the person, or keep the draw inside the domain.
  const first = draw({ randomizer: 'hundred', seed: 4, now: NOW })
  const fp = first.picks as HundredPicks
  for (let seed = 5; seed < 30; seed++) {
    assert.equal((draw({ randomizer: 'hundred', seed, now: NOW, prev: first, locks: ['person'] }).picks as HundredPicks).rank, fp.rank)
    assert.equal((draw({ randomizer: 'hundred', seed, now: NOW, prev: first, locks: ['domain'] }).picks as HundredPicks).domain, fp.domain)
    const era = draw({ randomizer: 'hundred', seed, now: NOW, prev: first, locks: ['era'] }).picks as HundredPicks
    assert.deepEqual([era.domain, era.era], [fp.domain, fp.era])
  }

  // The same domain twice in a row is re-drawn once.
  let redrawn = false
  for (let seed = 0; seed < 80 && !redrawn; seed++) {
    const fresh = draw({ randomizer: 'hundred', seed, now: NOW })
    const again = draw({ randomizer: 'hundred', seed, now: NOW, history: [entry(fresh, 1)] })
    redrawn = again.rules.some((r) => r.tag === 'balance' && /twice in a row/.test(r.text))
  }
  assert.ok(redrawn, 'the same-domain rule fires')

  // 30-day block: the only two people in a cell, both spun recently, lift to the one spun longest ago.
  {
    const cell = HUNDRED.people.filter((p) => p.domain === 'faith' && p.era === 'medieval')
    assert.deepEqual(cell.map((p) => p.name), ['Muhammad', 'Pope Urban II'])
    const fake = (rank: number, d: number) => {
      const r = draw({ randomizer: 'hundred', seed: 1, now: NOW, prev: { picks: { domain: 'faith', era: 'medieval', rank, lens: 'Without them' } }, locks: ['person'] })
      return entry(r, d)
    }
    const blockedOne = [fake(1, 5)]
    const blockedBoth = [fake(1, 5), fake(51, 20)]
    for (let seed = 0; seed < 40; seed++) {
      const r = draw({ randomizer: 'hundred', seed, now: NOW, history: blockedOne, prev: { picks: { domain: 'faith', era: 'medieval', rank: 51, lens: 'x' } }, locks: ['era'] })
      assert.equal((r.picks as HundredPicks).rank, 51, 'Muhammad is blocked for 30 days')
      const lifted = draw({ randomizer: 'hundred', seed, now: NOW, history: blockedBoth, prev: { picks: { domain: 'faith', era: 'medieval', rank: 51, lens: 'x' } }, locks: ['era'] })
      assert.equal((lifted.picks as HundredPicks).rank, 51, 'the block lifts to the one spun longest ago')
    }
  }

  // Sequence mode walks the ranking, wrapping from 100 to 1; a person lock wins over it.
  {
    const at = (rank: number) => entry(draw({ randomizer: 'hundred', seed: 2, now: NOW, prev: { picks: { domain: hundredByRank(rank)!.domain, era: hundredByRank(rank)!.era, rank, lens: 'Without them' } }, locks: ['person'] }), 1)
    const next = draw({ randomizer: 'hundred', seed: 9, now: NOW, history: [at(30)], sequence: true })
    assert.equal((next.picks as HundredPicks).rank, 31)
    assert.equal((next.subject as HundredSubject).sequence, true)
    assert.ok(next.rules.some((r) => r.tag === 'contested'), 'Shakespeare carries the authorship rule')
    assert.equal((draw({ randomizer: 'hundred', seed: 9, now: NOW, history: [at(100)], sequence: true }).picks as HundredPicks).rank, 1)
    const none = draw({ randomizer: 'hundred', seed: 9, now: NOW, sequence: true })
    assert.ok(none.rules.some((r) => r.tag === 'sequence' && /previous spin/.test(r.text)))
    const prev = draw({ randomizer: 'hundred', seed: 9, now: NOW, history: [at(30)] })
    const locked = draw({ randomizer: 'hundred', seed: 9, now: NOW, history: [at(30)], sequence: true, prev, locks: ['person'] })
    assert.equal((locked.picks as HundredPicks).rank, (prev.picks as HundredPicks).rank)
  }

  // 90-day block re-draws the lens; flags fire their rules.
  {
    const hitler = { domain: 'power', era: 'modern', rank: 39, lens: 'Without them' }
    const ran = draw({ randomizer: 'hundred', seed: 3, now: NOW, prev: { picks: hitler }, locks: ['person', 'lens'] })
    assert.equal((ran.picks as HundredPicks).lens, 'Without them')
    assert.ok(ran.rules.some((r) => r.tag === 'human cost'))
    // Six of the seven lenses ran with him inside 90 days: every draw ends on the seventh.
    const free = HUNDRED.lenses[HUNDRED.lenses.length - 1]!.name
    const history = HUNDRED.lenses.filter((l) => l.name !== free).map((l, i) => entry({ ...ran, combo: `adolf-hitler|${l.name}` }, 40 + i))
    let blocked = false
    for (let seed = 0; seed < 20; seed++) {
      const again = draw({ randomizer: 'hundred', seed, now: NOW, history, prev: { picks: hitler }, locks: ['person'] })
      assert.equal((again.picks as HundredPicks).lens, free)
      blocked ||= again.rules.some((r) => r.tag === '90 days' && r.kind === 'block')
    }
    assert.ok(blocked, 'the 90-day rule fires')
    const muhammad = draw({ randomizer: 'hundred', seed: 3, now: NOW, prev: { picks: { domain: 'faith', era: 'medieval', rank: 1, lens: 'x' } }, locks: ['person'] })
    assert.ok(muhammad.rules.some((r) => r.tag === 'depiction'))
    assert.ok(muhammad.rules.some((r) => r.tag === 'faith'))
    const moses = draw({ randomizer: 'hundred', seed: 3, now: NOW, prev: { picks: { domain: 'faith', era: 'ancient', rank: 15, lens: 'x' } }, locks: ['person'] })
    assert.ok(moses.rules.some((r) => r.tag === 'historicity'))
  }

  // Profile mappings on recorded Wikidata, Wikipedia and pageviews shapes.
  assert.deepEqual(formatWikidataTime('+1643-01-04T00:00:00Z', 11), { date: '4 January 1643', year: 1643 })
  assert.deepEqual(formatWikidataTime('-0383-01-01T00:00:00Z', 9), { date: '384 BCE', year: -383 })
  assert.deepEqual(formatWikidataTime('-0500-01-01T00:00:00Z', 7), { date: 'c. 6th century BCE', year: -500 })
  assert.deepEqual(formatWikidataTime('+1640-01-01T00:00:00Z', 8), { date: 'c. 1640s', year: 1640 })
  assert.equal(formatWikidataTime('nonsense', 11), null)
  assert.deepEqual(parsePoint('Point(-0.630556 52.809167)'), { lat: 52.809167, lon: -0.630556 })
  assert.equal(parsePoint(undefined), null)
  assert.equal(commonsFilePage('https://commons.wikimedia.org/wiki/Special:FilePath/A%20b.jpg'), 'https://commons.wikimedia.org/wiki/File:A%20b.jpg')
  const v = (value: string) => ({ value })
  const newtonRows = [
    { desc: v('English mathematician'), birth: v('+1642-01-01T00:00:00Z'), birthPrec: v('9'), death: v('+1727-03-31T00:00:00Z'), deathPrec: v('11'), bpLabel: v('Woolsthorpe Manor'), bpCoord: v('Point(-0.63 52.81)'), dpLabel: v('Kensington'), image: v('http://commons.wikimedia.org/wiki/Special:FilePath/N.jpg'), sitelinks: v('303') },
    { birth: v('+1643-01-04T00:00:00Z'), birthPrec: v('11'), death: v('+1727-01-01T00:00:00Z'), deathPrec: v('9') },
    { birth: v('+1001-01-01T00:00:00Z'), birthPrec: v('6') },
  ]
  const newton = profileFromSparql(newtonRows)
  assert.equal(newton.born!.date, '1642 or 4 January 1643 (sources differ)', 'each year once, coarse values dropped')
  assert.equal(newton.died!.date, '31 March 1727', 'the most precise value of a year')
  assert.deepEqual([newton.born!.lat, newton.born!.lon, newton.died!.lat], [52.81, -0.63, null])
  assert.equal(newton.image, 'https://commons.wikimedia.org/wiki/Special:FilePath/N.jpg')
  assert.equal(newton.sitelinks, 303)
  const blank = profileFromSparql([{ birth: v('-0627-01-01T00:00:00Z'), birthPrec: v('9'), bpLabel: v('http://www.wikidata.org/.well-known/genid/abc') }])
  assert.deepEqual(blank.born, { date: '628 BCE', year: -627, place: null, lat: null, lon: null })
  assert.equal(profileFromSparql([]).born, null)
  assert.deepEqual(pageviewWindow(new Date('2026-10-27T06:00:00Z')), { start: '2025100100', end: '2026090100' })
  assert.deepEqual(pageviewsFromBody({ items: [{ timestamp: '2026090100', views: 5 }, { timestamp: '2025100100', views: 9 }, { views: 1 }] }), [
    { month: '2025-10', views: 9 },
    { month: '2026-09', views: 5 },
  ])

  const months = (views: number[]) => views.map((v, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, views: v }))
  assert.deepEqual(completeMonths(months([50, 60, 55, 2])), { series: months([50, 60, 55]), dropped: '2026-04' })
  assert.deepEqual(completeMonths(months([50, 60, 55, 40])).dropped, null)
  assert.deepEqual(completeMonths(months([50, 2])).dropped, null, 'too short to judge')

  // The loader on a fake API: every source read; a portrait withheld; failures recorded, never thrown.
  pending.push(
    (async () => {
      const fakeFetch = (async (input: string | URL | Request) => {
        const url = String(input)
        if (url.startsWith('https://query.wikidata.org/')) return Response.json({ results: { bindings: newtonRows } })
        if (url.includes('/page/summary/')) return Response.json({ extract: ' Sir Isaac Newton was a polymath. ', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Isaac_Newton' } } })
        if (url.includes('/pageviews/')) return Response.json({ items: [{ timestamp: '2026080100', views: 146615 }] })
        return new Response('nope', { status: 404 })
      }) as typeof fetch
      const newtonP = hundredByRank(2)!
      const prof = await loadHundredProfile(newtonP, { fetch: fakeFetch, now: NOW })
      assert.deepEqual([prof.sources.wikidata, prof.sources.wikipedia, prof.sources.pageviews], ['ok', 'ok', 'ok'])
      assert.equal(prof.extract, 'Sir Isaac Newton was a polymath.')
      assert.equal(prof.imagePage, 'https://commons.wikimedia.org/wiki/File:N.jpg')
      assert.deepEqual(prof.pageviews, [{ month: '2026-08', views: 146615 }])
      assert.equal(prof.wikidataUrl, `https://www.wikidata.org/wiki/${newtonP.wikidata}`)
      const withheld = await loadHundredProfile(hundredByRank(1)!, { fetch: fakeFetch, now: NOW })
      assert.equal(withheld.image, null)
      assert.equal(withheld.imagePage, null)
      assert.ok(withheld.sources.notes.some((n) => /withheld/.test(n)))
      const down = await loadHundredProfile(newtonP, { fetch: (async () => new Response('down', { status: 503 })) as typeof fetch, now: NOW })
      assert.deepEqual([down.sources.wikidata, down.sources.wikipedia, down.sources.pageviews], ['failed', 'failed', 'failed'])
      assert.equal(down.sources.errors.length, 3)
      assert.equal(down.wikipediaUrl, 'https://en.wikipedia.org/wiki/Isaac_Newton')

      // The brief with a profile: the life, the pageviews, the credit, no portrait for the Prophet.
      const spin = asSpin(draw({ randomizer: 'hundred', seed: 1, now: NOW, prev: { picks: { domain: 'science', era: 'early-modern', rank: 2, lens: 'Reach in numbers' } }, locks: ['person', 'lens'] }))
      const withProfile = asSpin(spin, { subject: { ...(spin.subject as HundredSubject), profile: prof } })
      const brief = assignmentSection(withProfile)
      assert.ok(brief.includes('#2 of 100'))
      assert.ok(brief.includes('2026-08: 146,615'))
      assert.ok(brief.includes('Woolsthorpe Manor'))
      assert.ok(brief.includes(hundredCreditLine(withProfile.subject as HundredSubject)))
      assert.ok(researchStub(withProfile).includes('146615'))
      const prophet = asSpin(draw({ randomizer: 'hundred', seed: 1, now: NOW, prev: { picks: { domain: 'faith', era: 'medieval', rank: 1, lens: 'x' } }, locks: ['person'] }))
      const prophetBrief = assignmentSection(asSpin(prophet, { subject: { ...(prophet.subject as HundredSubject), profile: withheld as HundredProfile } }))
      assert.ok(/No portrait, figure or likeness of Muhammad/.test(prophetBrief))
      assert.ok(!prophetBrief.includes('Special:FilePath'))
      for (const s of [brief, prophetBrief, formatSection(withProfile)]) assert.ok(!hasEmDash(s))
    })(),
  )
}

// Stub and brief sections.
const OCW_POOL = poolFor(planOcw({ randomizer: 'ocw', seed: 21, now: NOW }))
const LM_PLAN = planLandmark({ randomizer: 'landmark', seed: 21, now: NOW }, lmAwardsFor(planLandmark({ randomizer: 'landmark', seed: 21, now: NOW })))
const LM_POOL = lmPoolFor(LM_PLAN, lmAwardsFor(LM_PLAN))
for (const randomizer of ['desk', 'atlas', 'epics', 'ocw', 'landmark', 'hundred', 'footshorts', 'viznba'] as const) {
  const spin = asSpin(draw({ randomizer, seed: 21, now: NOW, news: NEWS, nbaNews: NBA, ocwPool: OCW_POOL, landmarkPool: LM_POOL }))
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
