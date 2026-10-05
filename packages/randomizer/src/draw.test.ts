/** Checks for the shared draw, the research stub and the brief sections.
 *  (run: npx tsx src/draw.test.ts) */
import assert from 'node:assert/strict'
import { ATLAS, DESK, EPICS, epicRoute, isPhilosophical } from './datasets'
import { DRAW_RULES, draw, normalizeLocks } from './draw'
import { assignmentSection, deliverablesSection, formatSection, researchAppendix } from './spinBrief'
import { extractHeroInsight, researchFileName, researchStub } from './stub'
import { hasEmDash } from './text'
import type { AtlasPicks, DeskPicks, DrawResult, EpicsPicks, SpinHistoryEntry, SpinRecord } from './types'

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

// Stub and brief sections.
for (const randomizer of ['desk', 'atlas', 'epics'] as const) {
  const spin = asSpin(draw({ randomizer, seed: 21, now: NOW }))
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
