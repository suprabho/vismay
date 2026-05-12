'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { CHART_AXIS_COLOR, CHART_LINE_COLOR } from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const RENEW_GREEN = '#22c55e'

interface Props {
  years: number[]
  values: (number | null)[]
}

export default function RenewablesShareChart({ years, values }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 8, right: 10, bottom: 22, left: 36 },
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
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: RENEW_GREEN, width: 1.5 },
        areaStyle: { color: RENEW_GREEN, opacity: 0.15 },
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
