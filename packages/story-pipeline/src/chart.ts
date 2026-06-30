import { assembleECharts } from 'flint-chart/echarts'
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
 */
export function buildEChartsOption(spec: ChartSpec): Record<string, unknown> {
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
