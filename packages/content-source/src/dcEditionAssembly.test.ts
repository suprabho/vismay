/** Template-viz floor checks: three rows, one row per subject, two columns for the matrix.
 *  (run: npx tsx src/dcEditionAssembly.test.ts) */
import assert from 'node:assert/strict'
import type { DcEditionStory } from './dcEditionTypes'
import { buildCapacityViz, buildMatrixViz, buildOrdersViz, MIN_VIZ_ROWS, subjectKey } from './dcEditionAssembly'

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
const stocks = new Map([
  ['AMZN', { ticker: 'AMZN', name: 'Amazon', category: 'hyperscalers' }],
  ['MSFT', { ticker: 'MSFT', name: 'Microsoft', category: 'hyperscalers' }],
  ['AMAT', { ticker: 'AMAT', name: 'Applied Materials', category: 'semi-equipment' }],
  ['ASML', { ticker: 'ASML', name: 'ASML', category: 'semi-equipment' }],
  ['KLAC', { ticker: 'KLAC', name: 'KLA', category: 'semi-equipment' }],
])
const places = new Map()
const site = (id: number, subject: string, mw: number, source = `Outlet ${id}`) =>
  story(id, { source, facts: { action: 'add', figures: [{ value: mw, unit: 'MW', label: 'capacity', subject, scope: 'site', status: 'committed' }], horizon: null } })

// 1. Two outlets on one site collapse to a row; two rows is no viz, three is.
{
  assert.equal(buildCapacityViz([site(1, 'BDx West Java', 640), site(2, 'BDx West Java', 640, 'Telecompaper'), site(3, 'Abilene', 1200)], places, stocks), null)
  const viz = buildCapacityViz([site(1, 'BDx West Java', 640), site(2, 'BDx West Java', 640, 'Telecompaper'), site(3, 'Abilene', 1200), site(4, 'Jamnagar', 1000)], places, stocks)
  assert.equal(viz?.rows.length, MIN_VIZ_ROWS)
  assert.equal(viz?.addedMw, 2840)
}

// 2. The hyperscaler matrix needs two kinds of move, not one column of dots.
{
  const cap = (id: number, t: string) => story(id, { layer: 'hyper', tickers: [t], facts: { action: 'capacity', figures: [], horizon: null } })
  assert.equal(buildMatrixViz([cap(1, 'AMZN'), cap(2, 'MSFT'), story(3, { layer: 'hyper', tickers: ['AMZN'], facts: { action: 'add', figures: [], horizon: null } })], stocks), null)
  const viz = buildMatrixViz([cap(1, 'AMZN'), cap(2, 'MSFT'), story(3, { layer: 'hyper', tickers: ['AMZN'], facts: { action: 'power-deal', figures: [], horizon: null } })], stocks)
  assert.deepEqual(viz?.actions, ['Power deal', 'Capacity'])
  assert.equal(viz?.cells.length, 3)
}

// 3. Orders: one row per toolmaker (the stated window beats a bare mark), three toolmakers to draw.
{
  const win = (id: number, t: string) => story(id, { layer: 'equip', tickers: [t], facts: { action: 'pull-forward', figures: [], horizon: { from: '2028', to: '2027' } } })
  const mark = (id: number, t: string) => story(id, { layer: 'equip', tickers: [t], facts: { action: 'other', figures: [{ value: 5, unit: 'bn USD', label: 'investment' }], horizon: null } })
  assert.equal(buildOrdersViz([mark(1, 'AMAT'), win(2, 'AMAT')], stocks, 2026.7), null)
  const viz = buildOrdersViz([mark(1, 'AMAT'), win(2, 'AMAT'), mark(3, 'ASML'), mark(4, 'KLAC')], stocks, 2026.7)
  assert.equal(viz?.rows.length, 3)
  assert.equal(viz?.rows[0].label, 'Applied Materials')
  assert.equal(viz?.rows[0].style, 'pull-forward')
}

// 4. subjectKey folds spelling and corporate suffixes.
assert.equal(subjectKey('BDx Data Centres Ltd.'), subjectKey('bdx data centers'))

console.log('dcEditionAssembly.test: ok')
