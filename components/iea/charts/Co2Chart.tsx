'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { CHART_ACCENT, CHART_AXIS_COLOR, CHART_LINE_COLOR } from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  years: number[]
  values: (number | null)[]
}

export default function Co2Chart({ years, values }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 8, right: 10, bottom: 22, left: 44 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#18181b',
      borderColor: CHART_LINE_COLOR,
      textStyle: { color: '#f4f4f5', fontSize: 11 },
      valueFormatter: (v) => (typeof v === 'number' ? `${Math.round(v).toLocaleString()} Mt` : '—'),
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
        formatter: (v: number) =>
          v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
      },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: CHART_ACCENT, width: 1.5 },
        areaStyle: { color: CHART_ACCENT, opacity: 0.15 },
        data: values,
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 160, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
