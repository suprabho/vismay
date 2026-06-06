import type { ChartSpec } from './types'

/**
 * Theme-token colours the renderer swaps for live CSS variables (see
 * GenericChart). Cycled across series so a multi-series chart stays on-palette.
 */
const SERIES_COLORS = ['$accent', '$teal', '$accent2', '$amber', '$positive', '$muted']

/**
 * Expand a simplified `ChartSpec` into a full ECharts option. Deterministic on
 * purpose: the model emits categories + numeric series (clean structured
 * output), and this builds the nested option the engine can't reliably have a
 * model author by hand. The returned shape matches the chart-data contract:
 * `{ steps: [{ title?, option }] }`.
 */
export function buildChartData(spec: ChartSpec): {
  steps: Array<{ title?: string; option: Record<string, unknown> }>
} {
  return { steps: [{ title: spec.title, option: buildEChartsOption(spec) }] }
}

export function buildEChartsOption(spec: ChartSpec): Record<string, unknown> {
  const multi = spec.series.length > 1
  return {
    grid: { left: 48, right: 24, top: 32, bottom: 40, containLabel: true },
    tooltip: { trigger: 'axis' },
    ...(multi ? { legend: { top: 0, textStyle: { color: '$muted' } } } : {}),
    xAxis: {
      type: 'category',
      data: spec.categories,
      ...(spec.xLabel ? { name: spec.xLabel } : {}),
      axisLine: { lineStyle: { color: '$line' } },
      axisLabel: { color: '$muted' },
    },
    yAxis: {
      type: 'value',
      ...(spec.yLabel ? { name: spec.yLabel } : {}),
      splitLine: { lineStyle: { color: '$line' } },
      axisLabel: { color: '$muted' },
    },
    series: spec.series.map((s, i) => ({
      name: s.name,
      type: spec.chartType,
      data: s.data,
      smooth: spec.chartType === 'line',
      itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      ...(spec.chartType === 'line'
        ? { lineStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] } }
        : {}),
    })),
  }
}
