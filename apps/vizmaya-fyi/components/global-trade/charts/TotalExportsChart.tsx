'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import {
  CHART_ACCENT,
  CHART_AXIS_COLOR,
  CHART_LINE_COLOR,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_TEXT,
  formatUsd,
} from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  years: number[]
  values: (number | null)[]
}

export default function TotalExportsChart({ years, values }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 10, right: 10, bottom: 24, left: 46 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: CHART_TOOLTIP_BG,
      borderColor: CHART_LINE_COLOR,
      textStyle: { color: CHART_TOOLTIP_TEXT, fontSize: 11 },
      valueFormatter: (v) => (typeof v === 'number' ? formatUsd(v) : '—'),
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
      splitLine: { lineStyle: { color: CHART_LINE_COLOR, type: 'dashed' } },
      axisLabel: {
        color: CHART_AXIS_COLOR,
        fontSize: 9,
        formatter: (v: number) => formatUsd(v).replace('$', ''),
      },
    },
    series: [
      {
        name: 'Total exports',
        type: 'line',
        smooth: true,
        symbol: 'none',
        connectNulls: false,
        lineStyle: { width: 2, color: CHART_ACCENT },
        areaStyle: { opacity: 0.14, color: CHART_ACCENT },
        data: values,
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 200, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
