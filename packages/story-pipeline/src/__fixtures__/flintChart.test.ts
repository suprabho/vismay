/**
 * Flint chart compile-path contract check
 * (run: npx tsx src/__fixtures__/flintChart.test.ts)
 *
 * The chart DATA pass emits a flint tabular ChartSpec (columns + rows +
 * encodings); `buildChartData` compiles it to the renderer's chart-data
 * contract `{ steps: [{ title?, option }] }` via flint's `assembleECharts`,
 * then re-themes it. This is the deterministic half of the integration (no LLM,
 * no network), so it's the reliable regression guard: it proves a spec compiles,
 * stays on the renderer's $-token theme, and exposes no flint internals.
 */
import assert from 'node:assert'
import { buildChartData } from '../chart'
import type { ChartSpec } from '../types'

type Opt = Record<string, any>

/** The compiled option of a single-step chart. */
function compile(spec: ChartSpec): Opt {
  const out = buildChartData(spec)
  assert.equal(out.steps.length, 1, 'one step')
  return out.steps[0]!.option as Opt
}

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : v == null ? [] : [v])

let passed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (e) {
    console.log(`✗ ${name} — ${e instanceof Error ? e.message : String(e)}`)
    process.exitCode = 1
  }
}

const bar: ChartSpec = {
  id: 'gdp',
  title: 'GDP by country',
  chartType: 'Bar Chart',
  columns: [
    { name: 'country', semanticType: 'Country' },
    { name: 'gdp', semanticType: 'Quantity' },
  ],
  rows: [
    ['US', 25],
    ['CN', 18],
    ['IN', 3.5],
  ],
  encodings: { x: 'country', y: ['gdp'] },
  yLabel: 'GDP ($T)',
}

check('bar chart compiles to one bar series with all rows', () => {
  const o = compile(bar)
  const series = asArray(o.series)
  assert.equal(series.length, 1, 'one series')
  assert.equal(series[0].type, 'bar', 'series type bar')
  assert.equal(asArray(series[0].data).length, 3, 'one datum per row')
})

check('theming: palette + series colour use renderer $-tokens', () => {
  const o = compile(bar)
  assert.ok(Array.isArray(o.color) && o.color[0] === '$accent', 'top-level color is the $-token cycle')
  const c = asArray(o.series)[0].itemStyle?.color
  assert.equal(c, '$accent', `series itemStyle.color tokenised, got ${c}`)
})

check('theming: axis text coloured for dark themes', () => {
  const o = compile(bar)
  const x = asArray(o.xAxis)[0]
  const y = asArray(o.yAxis)[0]
  assert.equal(x.axisLabel?.color, '$muted', 'x axisLabel tokenised')
  assert.equal(y.splitLine?.lineStyle?.color, '$line', 'y splitLine tokenised')
})

check('no flint internals leak into the option', () => {
  const o = compile(bar)
  const leaked = Object.keys(o).filter((k) => k.startsWith('_'))
  assert.deepEqual(leaked, [], `private keys stripped, found ${leaked.join(',')}`)
})

check('author xLabel/yLabel override flint field-name axis titles', () => {
  const o = compile(bar)
  assert.equal(asArray(o.yAxis)[0].name, 'GDP ($T)', 'yLabel applied')
  // No xLabel on the spec → flint keeps the field name.
  assert.equal(asArray(o.xAxis)[0].name, 'country', 'x falls back to field name')
})

check('multiple y columns fold into a multi-series', () => {
  const o = compile({
    id: 'm',
    chartType: 'Grouped Bar Chart',
    columns: [
      { name: 'yr', semanticType: 'Year' },
      { name: 'a', semanticType: 'Quantity' },
      { name: 'b', semanticType: 'Quantity' },
    ],
    rows: [
      ['2019', 10, 5],
      ['2020', 14, 9],
    ],
    encodings: { x: 'yr', y: ['a', 'b'] },
  })
  const series = asArray(o.series)
  assert.equal(series.length, 2, 'two series from two y columns')
  assert.equal(series[1].itemStyle?.color, '$teal', 'second series gets the next token')
})

// Beyond bar/line — the point of the integration. Each must assemble without
// throwing and produce its expected ECharts series type.
const beyond: Array<{ type: ChartSpec['chartType']; expect: string; spec: ChartSpec }> = [
  {
    type: 'Scatter Plot',
    expect: 'scatter',
    spec: {
      id: 's',
      chartType: 'Scatter Plot',
      columns: [
        { name: 'w', semanticType: 'Quantity' },
        { name: 'm', semanticType: 'Quantity' },
      ],
      rows: [
        [1, 2],
        [2, 4],
      ],
      encodings: { x: 'w', y: ['m'] },
    },
  },
  {
    type: 'Pie Chart',
    expect: 'pie',
    spec: {
      id: 'p',
      chartType: 'Pie Chart',
      columns: [
        { name: 'cat', semanticType: 'Category' },
        { name: 'v', semanticType: 'Quantity' },
      ],
      rows: [
        ['A', 30],
        ['B', 70],
      ],
      encodings: { color: 'cat', angle: 'v' },
    },
  },
  {
    type: 'Radar Chart',
    expect: 'radar',
    spec: {
      id: 'r',
      chartType: 'Radar Chart',
      columns: [
        { name: 'yr', semanticType: 'Year' },
        { name: 'a', semanticType: 'Quantity' },
        { name: 'b', semanticType: 'Quantity' },
      ],
      rows: [
        ['2019', 10, 5],
        ['2020', 14, 9],
      ],
      encodings: { x: 'yr', y: ['a', 'b'] },
    },
  },
]

for (const { type, expect, spec } of beyond) {
  check(`${type} assembles to a ${expect} series`, () => {
    const o = compile(spec)
    const types = asArray(o.series).map((s) => s?.type)
    assert.ok(types.includes(expect), `expected a ${expect} series, got [${types.join(',')}]`)
  })
}

console.log(`\n${process.exitCode ? '✗ failures above' : `✓ all ${passed} flint-chart checks passed`}`)
