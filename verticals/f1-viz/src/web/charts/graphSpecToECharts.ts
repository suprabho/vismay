/**
 * GraphSpec → ECharts option adapter.
 *
 * Maps the donor's chart taxonomy onto the monorepo's ECharts host. The line
 * family (line / multi_line / comparison / area / sparkline / projection) +
 * scatter + bar are first-class; tire_map / heat_map render as an ECharts
 * heatmap; anything else falls back to a line. `dataPoints` is consumed as-is
 * (forecasts precomputed upstream).
 */
import type { EChartsOption } from 'echarts'
import type { ChartColors } from '@vismay/viz-engine'
import type { GraphSpec, GraphSeries } from './graphSpec'

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function seriesDash(s: GraphSeries): 'solid' | 'dashed' {
  if (s.strokeDash) return 'dashed'
  return s.type === 'projected' || s.type === 'reference' ? 'dashed' : 'solid'
}

function annotationOverlays(spec: GraphSpec, colors: ChartColors) {
  const markLineData: Record<string, unknown>[] = []
  const markAreaData: Array<Array<Record<string, unknown>>> = []
  const markPointData: Record<string, unknown>[] = []
  for (const a of spec.annotations ?? []) {
    const color = a.color || colors.muted
    if (a.type === 'line' && a.xValue != null) {
      markLineData.push({ xAxis: a.xValue, label: { formatter: a.label, color }, lineStyle: { color, type: 'dashed' } })
    } else if (a.type === 'band' && a.xRange) {
      markAreaData.push([{ xAxis: a.xRange[0], itemStyle: { color: `${color}22` }, label: { formatter: a.label, color } }, { xAxis: a.xRange[1] }])
    } else if ((a.type === 'point' || a.type === 'label') && a.xValue != null) {
      markPointData.push({ coord: [a.xValue, 0], value: a.label, itemStyle: { color } })
    }
  }
  return { markLineData, markAreaData, markPointData }
}

export function graphSpecToECharts(spec: GraphSpec, colors: ChartColors): EChartsOption {
  const xKey = spec.xAxis?.key ?? 'x'
  const rows = spec.dataPoints ?? []
  const xs = rows.map((r) => r[xKey])
  const xNumeric = xs.length > 0 && xs.every((v) => num(v) != null)
  const axisLabelColor = colors.muted
  const grid = { left: 48, right: 18, top: spec.title ? 44 : 18, bottom: 36 }

  const baseAxis = {
    nameTextStyle: { color: axisLabelColor, fontFamily: 'var(--font-mono)', fontSize: 10 },
    axisLabel: { color: axisLabelColor, fontFamily: 'var(--font-mono)', fontSize: 10 },
    axisLine: { lineStyle: { color: colors.line ?? colors.muted } },
    splitLine: { lineStyle: { color: colors.line ?? colors.muted, opacity: 0.25 } },
  }

  // ── Heatmap family ─────────────────────────────────────────────────────────
  if (spec.type === 'tire_map' || spec.type === 'heat_map') {
    const yKey = spec.yAxis?.key ?? 'y'
    const valKey = spec.series[0]?.dataKey ?? 'value'
    const xCats = Array.from(new Set(rows.map((r) => String(r[xKey]))))
    const yCats = Array.from(new Set(rows.map((r) => String(r[yKey]))))
    const data = rows.map((r) => [xCats.indexOf(String(r[xKey])), yCats.indexOf(String(r[yKey])), num(r[valKey]) ?? 0])
    const vals = data.map((d) => d[2] as number)
    return {
      backgroundColor: 'transparent',
      title: spec.title ? { text: spec.title, left: 'center', textStyle: { color: colors.muted, fontSize: 12 } } : undefined,
      grid,
      xAxis: { type: 'category', data: xCats, name: spec.xAxis?.label, ...baseAxis },
      yAxis: { type: 'category', data: yCats, name: spec.yAxis?.label, ...baseAxis },
      visualMap: {
        min: Math.min(0, ...vals),
        max: Math.max(1, ...vals),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { color: axisLabelColor },
        inRange: { color: [colors.accent2 ?? colors.teal ?? '#2dd4bf', colors.accent ?? '#f59e0b', colors.red ?? '#ef4444'] },
      },
      series: [{ type: 'heatmap', data }],
    }
  }

  // ── Line / scatter / bar family ─────────────────────────────────────────────
  const echKind: 'line' | 'scatter' | 'bar' =
    spec.type === 'scatter' ? 'scatter' : spec.type === 'bar' || spec.type === 'bar_grouped' ? 'bar' : 'line'
  const isArea = spec.type === 'area'
  const isSpark = spec.type === 'sparkline'

  // A bare line/area/projection with no explicit series → synthesize one from yAxis.
  const seriesDefs: GraphSeries[] =
    spec.series.length > 0
      ? spec.series
      : [{ id: 'y', label: spec.yAxis?.label ?? 'value', color: colors.accent ?? '#f59e0b', dataKey: spec.yAxis?.key ?? 'y', type: 'actual' }]

  const { markLineData, markAreaData, markPointData } = annotationOverlays(spec, colors)

  const series = seriesDefs.map((s, i) => {
    const data = rows.map((r) => {
      const y = num(r[s.dataKey])
      return xNumeric ? [num(r[xKey]), y] : y
    })
    const color = s.color || colors.accent || '#f59e0b'
    const isFirst = i === 0
    return {
      name: s.label,
      type: echKind,
      smooth: echKind === 'line',
      showSymbol: echKind === 'scatter' || rows.length <= 40,
      symbolSize: echKind === 'scatter' ? 7 : 4,
      data,
      itemStyle: { color },
      lineStyle: echKind === 'line' ? { color, type: seriesDash(s), width: isSpark ? 1.5 : 2 } : undefined,
      areaStyle: isArea ? { color: `${color}33` } : undefined,
      ...(isFirst
        ? {
            markLine: markLineData.length ? { symbol: 'none', data: markLineData } : undefined,
            markArea: markAreaData.length ? { data: markAreaData } : undefined,
            markPoint: markPointData.length ? { data: markPointData } : undefined,
          }
        : {}),
    }
  })

  const yDomain = spec.yAxis?.domain
  return {
    backgroundColor: 'transparent',
    title: spec.title ? { text: spec.title, left: 'center', textStyle: { color: colors.muted, fontSize: 12 } } : undefined,
    legend: seriesDefs.length > 1 && !isSpark ? { top: spec.title ? 22 : 0, textStyle: { color: axisLabelColor, fontSize: 10 } } : undefined,
    grid: isSpark ? { left: 4, right: 4, top: 4, bottom: 4 } : { ...grid, top: seriesDefs.length > 1 ? grid.top + 18 : grid.top },
    xAxis: {
      type: xNumeric ? 'value' : 'category',
      data: xNumeric ? undefined : xs.map((v) => String(v)),
      name: isSpark ? undefined : spec.xAxis?.label,
      show: !isSpark,
      ...baseAxis,
    },
    yAxis: {
      type: 'value',
      name: isSpark ? undefined : spec.yAxis?.label,
      min: yDomain ? yDomain[0] : undefined,
      max: yDomain ? yDomain[1] : undefined,
      show: !isSpark,
      ...baseAxis,
    },
    series: series as EChartsOption['series'],
  }
}
