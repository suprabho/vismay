import { assembleECharts } from 'flint-chart/echarts'
import { isRelationshipChartType } from './chartVocab'
import type { ChartSpec, ChartEncodings } from './types'

/**
 * Theme-token colours the renderer swaps for live CSS variables (see
 * GenericChart). Cycled across series so a multi-series chart stays on-palette.
 */
const SERIES_COLORS = ['$accent', '$teal', '$accent2', '$amber', '$positive', '$muted']

/**
 * Compile a {@link ChartSpec} into a full ECharts option via flint-chart's
 * `assembleECharts`: the model emits a compact tabular spec (columns + rows +
 * channel encodings), and flint derives the scales, axes, layout, and series the
 * engine can't reliably have a model author by hand. The returned shape matches
 * the chart-data contract: `{ steps: [{ title?, option }] }`.
 */
export function buildChartData(spec: ChartSpec): {
  steps: Array<{ title?: string; option: Record<string, unknown> }>
} {
  return { steps: [{ title: spec.title, option: buildEChartsOption(spec) }] }
}

/** A bare `$token` cycle for the series colours, themed by the renderer. */
function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length]!
}

/**
 * Build flint's `ChartAssemblyInput` from a {@link ChartSpec}, assemble the
 * ECharts option, then theme it: flint emits a fixed colour palette and leaves
 * axis/legend text uncoloured (ECharts defaults — illegible on a dark story
 * theme), so we swap its colours for the renderer's `$`-tokens and overlay the
 * axis/legend text colours the way the hand-built builder used to.
 *
 * Relationship templates (Sankey / Chord / Network Graph) never reach flint —
 * its assembler only builds from flat tabular channels, so their edge-row specs
 * are hand-assembled here instead.
 */
export function buildEChartsOption(spec: ChartSpec): Record<string, unknown> {
  if (isRelationshipChartType(spec.chartType)) return buildRelationshipOption(spec)
  const values = spec.rows.map((row) =>
    Object.fromEntries(spec.columns.map((c, i) => [c.name, row[i]])),
  )
  const semantic_types = Object.fromEntries(spec.columns.map((c) => [c.name, c.semanticType]))
  const option = assembleECharts({
    data: { values },
    semantic_types,
    chart_spec: { chartType: spec.chartType, encodings: normalizeEncodings(spec.encodings) },
  }) as Record<string, unknown>
  return themeOption(option, spec)
}

/**
 * Fold the spec's encodings into flint's `RawEncodingValue` map. A single-measure
 * `y` is passed as a bare string (flint shorthand); multiple measures stay an
 * array so flint folds them into a static multi-series.
 */
function normalizeEncodings(enc: ChartEncodings): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [channel, value] of Object.entries(enc)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      out[channel] = value.length === 1 ? value[0]! : value
    } else {
      out[channel] = value
    }
  }
  return out
}

type JsonObject = Record<string, unknown>

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Recursively set the colour leaves of `patch` onto `target`, preserving everything else. */
function overlayColors(target: JsonObject, patch: JsonObject): void {
  for (const [k, v] of Object.entries(patch)) {
    if (isObject(v)) {
      if (!isObject(target[k])) target[k] = {}
      overlayColors(target[k] as JsonObject, v)
    } else {
      target[k] = v
    }
  }
}

const AXIS_COLOR_OVERLAY: JsonObject = {
  axisLabel: { color: '$muted' },
  axisLine: { lineStyle: { color: '$line' } },
  splitLine: { lineStyle: { color: '$line' } },
  nameTextStyle: { color: '$muted' },
}

/** Swap flint's palette + axis defaults for the renderer's theme tokens. */
function themeOption(option: JsonObject, spec: ChartSpec): JsonObject {
  // Drop flint's internal layout bookkeeping (`_width`, `_pivot`, …).
  const out: JsonObject = {}
  for (const [k, v] of Object.entries(option)) {
    if (!k.startsWith('_')) out[k] = v
  }

  // Top-level palette covers slices/series flint didn't colour explicitly (pie/rose).
  out.color = [...SERIES_COLORS]

  // Per-series colours flint hard-set to hex → token cycle by series index.
  const series = Array.isArray(out.series) ? out.series : out.series ? [out.series] : []
  series.forEach((s, i) => {
    if (!isObject(s)) return
    const c = seriesColor(i)
    if (isObject(s.itemStyle) && 'color' in s.itemStyle) s.itemStyle.color = c
    if (isObject(s.lineStyle) && 'color' in s.lineStyle) s.lineStyle.color = c
    if (isObject(s.areaStyle) && 'color' in s.areaStyle) s.areaStyle.color = c
  })

  // Axis + legend text colours (flint leaves these as ECharts defaults).
  for (const axisKey of ['xAxis', 'yAxis'] as const) {
    const axis = out[axisKey]
    const list = Array.isArray(axis) ? axis : axis ? [axis] : []
    list.forEach((a) => {
      if (isObject(a)) overlayColors(a, AXIS_COLOR_OVERLAY)
    })
  }
  if (isObject(out.legend)) overlayColors(out.legend, { textStyle: { color: '$muted' } })
  if (Array.isArray(out.legend))
    out.legend.forEach((l) => {
      if (isObject(l)) overlayColors(l, { textStyle: { color: '$muted' } })
    })

  // Author-provided axis labels override flint's field-name defaults.
  if (spec.xLabel) setAxisName(out.xAxis, spec.xLabel)
  if (spec.yLabel) setAxisName(out.yAxis, spec.yLabel)

  return out
}

/** Set `name` on a single-axis object (the common case); leave multi-axis grids as flint framed them. */
function setAxisName(axis: unknown, name: string): void {
  if (isObject(axis)) axis.name = name
}

// ── Relationship charts (edge rows → sankey / graph, no flint) ──────────────

interface Edge {
  source: string
  target: string
  value: number
}

/** A single column name for a channel (first entry when the model sent an array). */
function encodingColumn(enc: ChartEncodings, channel: keyof ChartEncodings): string | null {
  const v = enc[channel]
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/**
 * Read the spec's rows as edges. Columns resolve through the source/target
 * encodings (weight via `value`, falling back to `y`), then positionally
 * (col 0 → source, 1 → target, 2 → weight) so a spec with rows but sloppy
 * encodings still assembles. Self-loops are dropped — they break sankey and
 * add nothing to a chord/network reading.
 */
function edgesFromSpec(spec: ChartSpec): { edges: Edge[]; sourceLabel: string; targetLabel: string } {
  const names = spec.columns.map((c) => c.name)
  const indexOf = (name: string | null, fallback: number): number => {
    const i = name ? names.indexOf(name) : -1
    return i === -1 ? fallback : i
  }
  const si = indexOf(encodingColumn(spec.encodings, 'source'), 0)
  const ti = indexOf(encodingColumn(spec.encodings, 'target'), 1)
  const vi = indexOf(encodingColumn(spec.encodings, 'value') ?? encodingColumn(spec.encodings, 'y'), 2)

  const edges: Edge[] = []
  for (const row of spec.rows) {
    const source = row[si]
    const target = row[ti]
    if (source == null || target == null || source === '' || target === '') continue
    if (String(source) === String(target)) continue
    const raw = row[vi]
    edges.push({
      source: String(source),
      target: String(target),
      value: typeof raw === 'number' && Number.isFinite(raw) ? raw : 1,
    })
  }
  return { edges, sourceLabel: names[si] ?? 'Source', targetLabel: names[ti] ?? 'Target' }
}

/**
 * Drop edges that would close a cycle (walk order = row order, so earlier
 * edges win). ECharts' sankey layout THROWS on cyclic input, which would
 * render as a blank chart — a slightly thinner diagram beats an empty one.
 */
function breakCycles(edges: Edge[]): Edge[] {
  const out: Edge[] = []
  const next = new Map<string, Set<string>>()
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true
    if (seen.has(from)) return false
    seen.add(from)
    for (const n of next.get(from) ?? []) if (reaches(n, to, seen)) return true
    return false
  }
  for (const e of edges) {
    if (reaches(e.target, e.source)) continue
    if (!next.has(e.source)) next.set(e.source, new Set())
    next.get(e.source)!.add(e.target)
    out.push(e)
  }
  return out
}

/**
 * Hand-assemble the ECharts option for a relationship spec. Same `$`-token
 * theming contract as the flint path: the renderer swaps tokens for the live
 * story palette (see GenericChart), and its themed tooltip defaults merge in
 * at render time — so no tooltip styling here.
 */
function buildRelationshipOption(spec: ChartSpec): JsonObject {
  const { edges, sourceLabel, targetLabel } = edgesFromSpec(spec)
  if (spec.chartType === 'Sankey Diagram') return sankeyOption(breakCycles(edges))
  return graphOption(edges, spec.chartType === 'Chord Diagram' ? 'circular' : 'force', {
    sourceLabel,
    targetLabel,
  })
}

function sankeyOption(edges: Edge[]): JsonObject {
  const nodes = [...new Set(edges.flatMap((e) => [e.source, e.target]))]
  return {
    color: [...SERIES_COLORS],
    series: [
      {
        type: 'sankey',
        data: nodes.map((name) => ({ name })),
        links: edges.map((e) => ({ ...e })),
        nodeAlign: 'justify',
        // 'gradient' blends each link between its endpoint node colours.
        lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
        itemStyle: { borderColor: '$line', borderWidth: 0.5 },
        label: { color: '$muted', fontSize: 11 },
        emphasis: { focus: 'adjacency' },
      },
    ],
  }
}

/**
 * Chord (circular) / network (force) graph. Node size scales with total edge
 * weight; when the edge set is bipartite (no name on both sides — e.g.
 * exporters → product chapters) the two sides get their own colour category,
 * named after the source/target columns.
 */
function graphOption(
  edges: Edge[],
  layout: 'circular' | 'force',
  labels: { sourceLabel: string; targetLabel: string },
): JsonObject {
  const weight = new Map<string, number>()
  for (const e of edges) {
    weight.set(e.source, (weight.get(e.source) ?? 0) + e.value)
    weight.set(e.target, (weight.get(e.target) ?? 0) + e.value)
  }
  const sources = new Set(edges.map((e) => e.source))
  const targets = new Set(edges.map((e) => e.target))
  const bipartite = [...sources].every((s) => !targets.has(s))
  const maxNode = Math.max(...weight.values(), 1)
  const maxEdge = Math.max(...edges.map((e) => e.value), 1)

  return {
    color: [...SERIES_COLORS],
    series: [
      {
        type: 'graph',
        layout,
        ...(layout === 'circular'
          ? { circular: { rotateLabel: true }, zoom: 0.85 }
          : { force: { repulsion: 220, edgeLength: [60, 140], gravity: 0.12 } }),
        roam: true,
        categories: bipartite
          ? [
              { name: labels.sourceLabel, itemStyle: { color: '$accent' } },
              { name: labels.targetLabel, itemStyle: { color: '$teal' } },
            ]
          : [{ name: labels.sourceLabel, itemStyle: { color: '$accent' } }],
        data: [...weight.entries()].map(([name, v]) => ({
          name,
          value: v,
          category: bipartite && targets.has(name) ? 1 : 0,
          symbolSize: 10 + Math.sqrt(v / maxNode) * 28,
        })),
        links: edges.map((e) => ({
          source: e.source,
          target: e.target,
          value: e.value,
          lineStyle: {
            width: 0.6 + Math.sqrt(e.value / maxEdge) * 4.5,
            opacity: 0.18 + Math.sqrt(e.value / maxEdge) * 0.32,
            color: '$accent',
            curveness: layout === 'circular' ? 0.28 : 0.1,
          },
        })),
        itemStyle: { borderColor: '$line', borderWidth: 0.6 },
        label: { show: true, position: 'right', color: '$muted', fontSize: 10 },
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } },
        blur: { itemStyle: { opacity: 0.2 }, lineStyle: { opacity: 0.05 } },
      },
    ],
  }
}
