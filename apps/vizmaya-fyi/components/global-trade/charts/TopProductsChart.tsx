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
  shortProductName,
} from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  products: { hsCode: string; name: string; valueUsd: number }[]
}

export default function TopProductsChart({ products }: Props) {
  // Horizontal bars read top-down largest-first; ECharts y-category renders
  // bottom-up, so reverse.
  const rows = [...products].slice(0, 8).reverse()

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 4, right: 44, bottom: 4, left: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: CHART_TOOLTIP_BG,
      borderColor: CHART_LINE_COLOR,
      textStyle: { color: CHART_TOOLTIP_TEXT, fontSize: 11 },
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        const row = rows[p.dataIndex as number]
        return `<b>HS ${row.hsCode}</b> ${row.name}<br/>${formatUsd(row.valueUsd)}`
      },
    },
    xAxis: {
      type: 'value',
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category',
      data: rows.map((p) => shortProductName(p.name, 26)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART_AXIS_COLOR, fontSize: 9.5 },
    },
    series: [
      {
        type: 'bar',
        barWidth: 10,
        itemStyle: { color: CHART_ACCENT, opacity: 0.85, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: CHART_AXIS_COLOR,
          fontSize: 9,
          formatter: (p) => formatUsd(rows[p.dataIndex].valueUsd),
        },
        data: rows.map((p) => p.valueUsd),
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: Math.max(160, rows.length * 26 + 16), width: '100%' }}
      opts={{ renderer: 'svg' }}
    />
  )
}
