'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import type { ChartSeries } from '@/lib/epics'
import { CHART_AXIS_COLOR, CHART_LINE_COLOR, ENERGY_SOURCE_COLORS } from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  years: number[]
  series: ChartSeries[]
}

export default function ElectricityMixChart({ years, series }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 8, right: 10, bottom: 54, left: 36 },
    legend: {
      bottom: 0,
      left: 'center',
      textStyle: { color: CHART_AXIS_COLOR, fontSize: 10 },
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 12,
      icon: 'circle',
      type: 'scroll',
      pageIconSize: 9,
      pageIconColor: CHART_AXIS_COLOR,
      pageIconInactiveColor: CHART_LINE_COLOR,
      pageTextStyle: { color: CHART_AXIS_COLOR, fontSize: 9 },
      padding: [4, 28],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#18181b',
      borderColor: CHART_LINE_COLOR,
      textStyle: { color: '#f4f4f5', fontSize: 11 },
      valueFormatter: (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—'),
    },
    xAxis: {
      type: 'category',
      data: years.map(String),
      axisLine: { lineStyle: { color: CHART_LINE_COLOR } },
      axisTick: { show: false },
      axisLabel: { color: CHART_AXIS_COLOR, fontSize: 9, interval: 'auto' },
    },
    yAxis: {
      type: 'value',
      max: 100,
      splitLine: { lineStyle: { color: CHART_LINE_COLOR, type: 'dashed' } },
      axisLabel: { color: CHART_AXIS_COLOR, fontSize: 9, formatter: '{value}%' },
    },
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      stack: 'total',
      smooth: false,
      symbol: 'none',
      lineStyle: { width: 0 },
      areaStyle: { opacity: 0.95 },
      itemStyle: { color: ENERGY_SOURCE_COLORS[s.name] ?? '#71717a' },
      data: s.values,
    })),
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 248, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
