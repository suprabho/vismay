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

// Relationship templates — edge rows (source → target → weight), hand-assembled
// without flint. This is the "trade relationships in the canvas" path.
const tradeEdges: Pick<ChartSpec, 'columns' | 'rows' | 'encodings'> = {
  columns: [
    { name: 'exporter', semanticType: 'Country' },
    { name: 'product', semanticType: 'Category' },
    { name: 'valueUsd', semanticType: 'Amount' },
  ],
  rows: [
    ['China', 'Electronics', 900],
    ['China', 'Vehicles', 200],
    ['Germany', 'Vehicles', 400],
    ['Germany', 'Machinery', 350],
    ['US', 'Electronics', 300],
  ],
  encodings: { source: 'exporter', target: 'product', value: 'valueUsd' },
}

check('Sankey Diagram assembles nodes + links from edge rows', () => {
  const o = compile({ id: 'trade-sankey', chartType: 'Sankey Diagram', ...tradeEdges })
  const s = asArray(o.series)[0]
  assert.equal(s.type, 'sankey', 'sankey series')
  assert.equal(asArray(s.data).length, 6, 'six unique nodes (3 exporters + 3 products)')
  assert.equal(asArray(s.links).length, 5, 'one link per edge row')
  assert.equal(asArray(s.links)[0].value, 900, 'weight rides the value channel')
})

check('sankey drops cycle-closing edges instead of throwing at render', () => {
  const o = compile({
    id: 'cycle',
    chartType: 'Sankey Diagram',
    columns: [
      { name: 'from', semanticType: 'Category' },
      { name: 'to', semanticType: 'Category' },
      { name: 'v', semanticType: 'Quantity' },
    ],
    rows: [
      ['A', 'B', 1],
      ['B', 'C', 1],
      ['C', 'A', 1], // closes A→B→C→A
    ],
    encodings: { source: 'from', target: 'to', value: 'v' },
  })
  assert.equal(asArray(asArray(o.series)[0].links).length, 2, 'cycle-closing edge dropped')
})

check('Chord Diagram is a circular graph with sized, categorised nodes', () => {
  const o = compile({ id: 'trade-chord', chartType: 'Chord Diagram', ...tradeEdges })
  const s = asArray(o.series)[0]
  assert.equal(s.type, 'graph', 'graph series')
  assert.equal(s.layout, 'circular', 'circular layout')
  assert.equal(asArray(s.categories).length, 2, 'bipartite edges → two categories')
  assert.equal(asArray(s.categories)[0].name, 'exporter', 'category named from source column')
  const china = asArray(s.data).find((n: any) => n.name === 'China')
  const us = asArray(s.data).find((n: any) => n.name === 'US')
  assert.ok(china.symbolSize > us.symbolSize, 'node size scales with edge weight')
})

check('Network Graph uses force layout', () => {
  const o = compile({ id: 'trade-net', chartType: 'Network Graph', ...tradeEdges })
  const s = asArray(o.series)[0]
  assert.equal(s.type, 'graph', 'graph series')
  assert.equal(s.layout, 'force', 'force layout')
})

check('relationship charts stay on renderer $-tokens', () => {
  const o = compile({ id: 'trade-chord2', chartType: 'Chord Diagram', ...tradeEdges })
  assert.ok(Array.isArray(o.color) && o.color[0] === '$accent', 'palette tokenised')
  const s = asArray(o.series)[0]
  assert.equal(asArray(s.categories)[0].itemStyle?.color, '$accent', 'category colour tokenised')
  assert.equal(asArray(s.links)[0].lineStyle?.color, '$accent', 'edge colour tokenised')
})

check('relationship edges resolve positionally when encodings are sloppy', () => {
  const o = compile({
    id: 'pos',
    chartType: 'Network Graph',
    columns: [
      { name: 'a', semanticType: 'Category' },
      { name: 'b', semanticType: 'Category' },
      { name: 'w', semanticType: 'Quantity' },
    ],
    rows: [['X', 'Y', 3]],
    encodings: {},
  })
  const s = asArray(o.series)[0]
  assert.equal(asArray(s.links).length, 1, 'edge built from column positions')
  assert.equal(asArray(s.links)[0].value, 3, 'weight from third column')
})

console.log(`\n${process.exitCode ? '✗ failures above' : `✓ all ${passed} flint-chart checks passed`}`)
