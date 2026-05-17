'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { CHART_AXIS_COLOR, CHART_LINE_COLOR } from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  months: string[]                      // YYYY-MM
  gasoline: (number | null)[]
  diesel: (number | null)[]
}

const GASOLINE_COLOR = '#f59e0b' // amber, matches the energy-profile accent
const DIESEL_COLOR = '#3b82f6'   // blue — separates the two clearly

function formatMonth(ym: string): string {
  // YYYY-MM → MMM 'YY (e.g. Apr '26). The full year on the first label only
  // would crowd more on the panel — short form is enough for a 60-month
  // strip.
  const [y, m] = ym.split('-')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]
  return `${month} '${y.slice(2)}`
}

export default function OilPricesChart({ months, gasoline, diesel }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 18, right: 10, bottom: 22, left: 38 },
    legend: {
      data: ['Petrol', 'Diesel'],
      top: 0,
      right: 0,
      textStyle: { color: CHART_AXIS_COLOR, fontSize: 9, fontFamily: 'JetBrains Mono' },
      itemWidth: 10,
      itemHeight: 8,
      itemGap: 12,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#18181b',
      borderColor: CHART_LINE_COLOR,
      textStyle: { color: '#f4f4f5', fontSize: 11 },
      valueFormatter: (v) => (typeof v === 'number' ? `$${v.toFixed(2)}/L` : '—'),
    },
    xAxis: {
      type: 'category',
      data: months.map(formatMonth),
      axisLine: { lineStyle: { color: CHART_LINE_COLOR } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_AXIS_COLOR,
        fontSize: 9,
        // Only show every ~12th label so a 5-year strip stays readable.
        interval: Math.max(0, Math.floor(months.length / 5) - 1),
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: CHART_LINE_COLOR, type: 'dashed' } },
      axisLabel: {
        color: CHART_AXIS_COLOR,
        fontSize: 9,
        formatter: (v: number) => `$${v.toFixed(1)}`,
      },
    },
    series: [
      {
        name: 'Petrol',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: GASOLINE_COLOR, width: 1.5 },
        data: gasoline,
        connectNulls: false,
      },
      {
        name: 'Diesel',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: DIESEL_COLOR, width: 1.5 },
        data: diesel,
        connectNulls: false,
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
