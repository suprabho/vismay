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

/** Carrier series for annotation overlays — kept out of the legend and tooltip. */
const OVERLAY_SERIES = '__overlays'

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function seriesDash(s: GraphSeries): 'solid' | 'dashed' {
  if (s.strokeDash) return 'dashed'
  return s.type === 'projected' || s.type === 'reference' ? 'dashed' : 'solid'
}

/** Seconds → "1:23.456" (`digits` = fractional digits; ticks use 1: "1:23.5"). */
export function formatLapTime(sec: number, digits = 3): string {
  const sign = sec < 0 ? '-' : ''
  const abs = Math.abs(sec)
  const m = Math.floor(abs / 60)
  const rest = abs - m * 60
  return m > 0 ? `${sign}${m}:${rest.toFixed(digits).padStart(digits ? 3 + digits : 2, '0')}` : `${sign}${rest.toFixed(digits)}s`
}

function valueFormatter(spec: GraphSpec, tick: boolean): (v: number) => string {
  const fmt = spec.yAxis?.format
  const unit = spec.yAxis?.unit
  if (fmt === 'laptime') return (v) => formatLapTime(v, tick ? 1 : 3)
  if (fmt === 'integer') return (v) => String(Math.round(v))
  return (v) => {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(tick ? 1 : 2)
    return !tick && unit ? `${s} ${unit}` : s
  }
}

function annotationOverlays(spec: GraphSpec, colors: ChartColors) {
  const markLineData: Record<string, unknown>[] = []
  const markAreaData: Array<Array<Record<string, unknown>>> = []
  const markPointData: Record<string, unknown>[] = []
  const floor = spec.yAxis?.domain?.[spec.yAxis.inverse ? 1 : 0] ?? 0
  // Bands that start right after the previous one drop their label a line so
  // back-to-back periods (SC straight into a red flag) don't overprint.
  let lastBandEnd = -Infinity
  let staggered = false
  for (const a of spec.annotations ?? []) {
    const color = a.color || colors.muted
    if (a.type === 'line' && a.xValue != null) {
      markLineData.push({
        xAxis: a.xValue,
        label: { formatter: a.label, color, position: 'insideEndTop', fontSize: 10 },
        lineStyle: { color, type: 'dashed' },
      })
    } else if (a.type === 'band' && a.xRange) {
      const start = Number(a.xRange[0])
      staggered = !staggered && Number.isFinite(start) && start - lastBandEnd < 3
      lastBandEnd = Number(a.xRange[1])
      markAreaData.push([
        {
          xAxis: a.xRange[0],
          itemStyle: { color: `${color}2e` },
          label: {
            formatter: a.label,
            color,
            position: 'insideTop',
            fontSize: 9,
            fontWeight: 'bold',
            distance: staggered ? 16 : 5,
          },
        },
        { xAxis: a.xRange[1] },
      ])
    } else if ((a.type === 'point' || a.type === 'label') && a.xValue != null) {
      markPointData.push({
        coord: [a.xValue, a.yValue ?? floor],
        value: a.label,
        symbol: a.symbol ?? 'circle',
        symbolSize: a.symbol === 'pin' ? 26 : 9,
        itemStyle: { color, borderColor: '#000', borderWidth: 1 },
        label: { show: !!a.label, formatter: a.label, position: 'top', color, fontSize: 9, distance: 4 },
      })
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
  const grid = { left: 48, right: 18, top: spec.title ? 44 : 18, bottom: spec.zoom ? 72 : 42 }

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
  const hasOverlays = markLineData.length + markAreaData.length + markPointData.length > 0

  const series: Record<string, unknown>[] = seriesDefs.map((s) => {
    const data = rows.map((r) => {
      const y = num(r[s.dataKey])
      return xNumeric ? [num(r[xKey]), y] : y
    })
    const color = s.color || colors.accent || '#f59e0b'
    return {
      name: s.label,
      type: echKind,
      smooth: echKind === 'line' && (spec.smooth ?? true),
      showSymbol: echKind === 'scatter' || rows.length <= 40,
      symbolSize: echKind === 'scatter' ? 7 : 4,
      data,
      itemStyle: { color },
      lineStyle: echKind === 'line' ? { color, type: seriesDash(s), width: isSpark ? 1.5 : 2 } : undefined,
      areaStyle: isArea ? { color: `${color}33` } : undefined,
    }
  })
  // Overlays ride a data-less carrier series so hiding a driver in the legend
  // never takes the event bands / pit markers with it.
  if (hasOverlays) {
    series.push({
      name: OVERLAY_SERIES,
      type: 'line',
      data: rows.map((r) => (xNumeric ? [num(r[xKey]), null] : null)),
      showSymbol: false,
      silent: true,
      z: 1,
      markLine: markLineData.length ? { symbol: 'none', silent: true, data: markLineData } : undefined,
      markArea: markAreaData.length ? { silent: true, data: markAreaData } : undefined,
      markPoint: markPointData.length ? { data: markPointData } : undefined,
    })
  }

  const yDomain = spec.yAxis?.domain
  const tickFmt = valueFormatter(spec, true)
  const tipFmt = valueFormatter(spec, false)
  const xLabel = spec.xAxis?.label ?? ''
  const showLegend = seriesDefs.length > 1 && !isSpark
  const titleH = spec.title ? 30 : 4
  return {
    backgroundColor: 'transparent',
    title: spec.title ? { text: spec.title, left: 'center', top: 0, textStyle: { color: colors.muted, fontSize: 12 } } : undefined,
    legend: showLegend
      ? {
          top: titleH,
          data: seriesDefs.map((s) => s.label),
          itemWidth: 14,
          itemHeight: 8,
          textStyle: { color: axisLabelColor, fontSize: 10 },
        }
      : undefined,
    tooltip: isSpark
      ? undefined
      : {
          trigger: 'axis',
          confine: true,
          formatter: (params: unknown) => {
            const list = (Array.isArray(params) ? params : [params]) as Array<{
              seriesName?: string
              marker?: string
              value?: unknown
              axisValueLabel?: string
            }>
            const rowsOut = list
              .filter((p) => p.seriesName !== OVERLAY_SERIES)
              .map((p) => {
                const v = Array.isArray(p.value) ? p.value[1] : p.value
                return typeof v === 'number' ? `${p.marker ?? ''}${p.seriesName}&nbsp;&nbsp;<b>${tipFmt(v)}</b>` : null
              })
              .filter(Boolean)
            if (!rowsOut.length) return ''
            return [`${xLabel} ${list[0]?.axisValueLabel ?? ''}`.trim(), ...rowsOut].join('<br/>')
          },
        },
    grid: isSpark
      ? { left: 4, right: 4, top: 4, bottom: 4 }
      : { ...grid, left: spec.yAxis?.format === 'laptime' ? 56 : grid.left, top: titleH + (showLegend ? 26 : 14) },
    dataZoom: spec.zoom && !isSpark
      ? [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
          { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 16, bottom: 8, showDetail: false, borderColor: 'transparent' },
        ]
      : undefined,
    xAxis: {
      type: xNumeric ? 'value' : 'category',
      data: xNumeric ? undefined : xs.map((v) => String(v)),
      min: xNumeric ? 'dataMin' : undefined,
      max: xNumeric ? 'dataMax' : undefined,
      name: isSpark ? undefined : spec.xAxis?.label,
      nameLocation: 'middle',
      nameGap: 28,
      show: !isSpark,
      ...baseAxis,
    },
    yAxis: {
      type: 'value',
      name: isSpark ? undefined : spec.yAxis?.label,
      min: yDomain ? yDomain[0] : undefined,
      max: yDomain ? yDomain[1] : undefined,
      // Without an explicit domain, fit the data instead of anchoring at 0 —
      // a 0-based axis flattens 1:20 vs 1:22 lap times into one line.
      scale: !yDomain && echKind !== 'bar',
      inverse: spec.yAxis?.inverse ?? false,
      show: !isSpark,
      ...baseAxis,
      axisLabel: { ...baseAxis.axisLabel, formatter: tickFmt },
    },
    series: series as EChartsOption['series'],
  }
}
