/** Grounding checks for composer-planned charts.
 *  (run: npx tsx src/dcEditionCharts.test.ts) */
import assert from 'node:assert/strict'
import type { DcEditionStory } from './dcEditionTypes'
import { plannerInput, pruneChartsForMembership, validateChartPlan, normaliseCharts } from './dcEditionCharts'

const story = (id: number, over: Partial<DcEditionStory>): DcEditionStory => ({
  id,
  url: `https://example.com/${id}`,
  title: `Story ${id}`,
  summary: null,
  source: `Outlet ${id}`,
  publishedAt: '2026-09-22T06:00:00Z',
  topics: ['data-centers'],
  tickers: [],
  layer: 'dc',
  place: null,
  region: 'na',
  theme: 'capacity',
  mood: 1,
  energy: true,
  facts: { action: 'add', figures: [], horizon: null },
  kind: 'news',
  ...over,
})

const stories: DcEditionStory[] = [
  story(1, { facts: { action: 'add', figures: [{ value: 640, unit: 'MW', label: 'AI data center capacity', subject: 'BDx West Java', scope: 'site', status: 'committed' }], horizon: null } }),
  story(2, { facts: { action: 'power-deal', figures: [{ value: 1.2, unit: 'GW', label: 'gas block', subject: 'Entergy', scope: 'company', status: 'committed' }], horizon: null } }),
  story(3, { title: 'Operator signs 300 MW lease', facts: { action: 'capacity', figures: [], horizon: null } }),
  story(4, { layer: 'semi', energy: false, facts: { action: null, figures: [{ value: 2, unit: 'bn USD', label: 'capex', subject: 'Foo', scope: 'company', status: 'committed' }], horizon: null } }),
]
const allowed = new Set([1, 2, 3])

const base = {
  title: 'Power committed today, by subject',
  caption: 'Three commitments on one scale.',
  chartType: 'Bar Chart',
  columns: [
    { name: 'Subject', semanticType: 'Name' },
    { name: 'Capacity (MW)', semanticType: 'Quantity' },
  ],
  encodings: { x: 'Subject', y: ['Capacity (MW)'] },
}

// 1. A grounded plan passes: value as written, base unit, and a headline number.
{
  const v = validateChartPlan({ ...base, rows: [['BDx', 640], ['Entergy', 1200], ['Operator', 300]], rowSourceIdxs: [0, 1, 2] }, 'energy', stories, allowed)
  assert.equal(v.ok, true)
  if (v.ok) {
    assert.deepEqual(v.plan.storyIds, [1, 2, 3])
    assert.equal(v.plan.sources.length, 3)
    assert.equal(v.plan.spec.rows.length, 3)
  }
}

// 2. A number no cited story states is refused.
{
  const v = validateChartPlan({ ...base, rows: [['BDx', 640], ['Entergy', 1500], ['Operator', 300]], rowSourceIdxs: [0, 1, 2] }, 'energy', stories, allowed)
  assert.equal(v.ok, false)
  if (!v.ok) assert.match(v.reason, /1500 is not a figure/)
}

// 3. Fewer than three rows is a sentence, not a chart.
{
  const v = validateChartPlan({ ...base, rows: [['BDx', 640], ['Entergy', 1200]], rowSourceIdxs: [0, 1] }, 'energy', stories, allowed)
  assert.equal(v.ok, false)
  if (!v.ok) assert.match(v.reason, /only 2 rows/)
}

// 4. A row citing a story outside the section is refused.
{
  const v = validateChartPlan({ ...base, rows: [['BDx', 640], ['Entergy', 1200], ['Foo', 2000]], rowSourceIdxs: [0, 1, 3] }, 'energy', stories, allowed)
  assert.equal(v.ok, false)
  if (!v.ok) assert.match(v.reason, /outside the/)
}

// 5. Encodings naming unknown columns are dropped; none left → refused.
{
  const v = validateChartPlan({ ...base, encodings: { x: 'Nope' }, rows: [['BDx', 640], ['Entergy', 1200], ['Operator', 300]], rowSourceIdxs: [0, 1, 2] }, 'energy', stories, allowed)
  assert.equal(v.ok, false)
}

// 5b. A measure column spanning more than 50× is not one scale.
{
  const big = [...stories, story(5, { facts: { action: 'disclosure', figures: [{ value: 200, unit: 'GW', label: 'queue', subject: 'ERCOT', scope: 'market', status: 'queued' }], horizon: null } })]
  const v = validateChartPlan({ ...base, rows: [['ERCOT', 200000], ['Entergy', 1200], ['Operator', 300]], rowSourceIdxs: [4, 1, 2] }, 'energy', big, new Set([1, 2, 3, 5]))
  assert.equal(v.ok, false)
  if (!v.ok) assert.match(v.reason, /spans 667×/)
}

// 6. Planner input indexes energy stories after news stories and carries the v3 tags.
{
  const iea = [story(9, { kind: 'iea', layer: null, facts: { action: null, figures: [{ value: 45, unit: '%', label: 'renewables share', subject: 'EU', scope: 'market', status: 'stated' }], horizon: null } })]
  const sections = plannerInput(stories, iea)
  const energy = sections.find((s) => s.section === 'energy')!
  assert.equal(energy.figures.length, 3)
  assert.equal(energy.figures.find((f) => f.value === 45)?.idx, 4)
  assert.equal(energy.figures.find((f) => f.value === 1.2)?.base, 1200)
  const semi = sections.find((s) => s.section === 'semi')!
  assert.equal(semi.figures.length, 1)
  assert.equal(semi.figures[0].base, 2000)
}

// 7. Membership pruning drops a chart whose story left the edition.
{
  const chart = { section: 'dc' as const, title: 't', caption: 'c', spec: { chartType: 'Bar Chart', columns: [], rows: [], encodings: {} }, sources: [], storyIds: [1, 2], svg: null, width: 0, height: 0, model: 'm', generatedAt: '' }
  assert.deepEqual(Object.keys(pruneChartsForMembership({ dc: chart }, [1, 2, 3], [])), ['dc'])
  assert.deepEqual(Object.keys(pruneChartsForMembership({ dc: chart }, [1, 3], [])), [])
}

// 8. Row normalisation drops malformed entries and non-SVG strings.
{
  const out = normaliseCharts({ dc: { title: 'x', spec: { chartType: 'Bar Chart', columns: [], rows: [] }, svg: 'not svg' }, bogus: {}, semi: 'no' })
  assert.deepEqual(Object.keys(out), ['dc'])
  assert.equal(out.dc?.svg, null)
}

console.log('dcEditionCharts.test: ok')
