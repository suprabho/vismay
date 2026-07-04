'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { CHART_AXIS_COLOR, CHART_LINE_COLOR } from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  /** [ISO date, value] pairs sorted ascending — dc_facility_timeline shape. */
  points: [string, number][]
  color: string
  valueFormatter: (v: number) => string
}

// One facility metric over time (power, compute, or capex). The x axis is a
// real time axis rather than categories because Epoch's observation dates are
// irregular — evenly spacing them would distort the build-out slope.
export default function TimelineChart({ points, color, valueFormatter }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 14, right: 12, bottom: 22, left: 46 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#18181b',
      borderColor: CHART_LINE_COLOR,
      textStyle: { color: '#f4f4f5', fontSize: 11 },
      valueFormatter: (v) => (typeof v === 'number' ? valueFormatter(v) : '—'),
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: CHART_LINE_COLOR } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_AXIS_COLOR,
        fontSize: 9,
        formatter: '{MMM} {yy}',
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: CHART_LINE_COLOR, type: 'dashed' } },
      axisLabel: {
        color: CHART_AXIS_COLOR,
        fontSize: 9,
        formatter: (v: number) => valueFormatter(v),
      },
    },
    series: [
      {
        type: 'line',
        smooth: false,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        areaStyle: { color, opacity: 0.08 },
        data: points,
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 180, width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
