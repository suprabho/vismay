'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const TITLES: Record<number, string> = {
  0: 'Memory dominance: SK Hynix + Samsung',
  1: "Shipbuilding dominance: 84% of the world's LNG carriers",
  2: 'One country. Three critical global shares. One chokepoint.',
}

export default function KoreaBarChart({ activeStep }: { activeStep: number }) {
  const { accent: ACCENT, amber: AMBER, red: RED, muted: MUTED, line: LINE } = useChartColors()
  const mobile = useIsMobile()

  const items = [
    { label: 'SK Hynix\nHBM', value: 62, color: ACCENT, group: 0 },
    { label: 'Samsung\nDRAM', value: 33, color: ACCENT, group: 0 },
    { label: 'LNG carrier\ndeliveries', value: 84, color: AMBER, group: 1 },
    { label: 'LNG orderbook\nby value', value: 67, color: AMBER, group: 1 },
    { label: 'Helium from\nQatar', value: 64.7, color: RED, group: 2 },
    { label: 'Oil from\nMideast', value: 70, color: RED, group: 2 },
  ]

  const title = TITLES[activeStep] ?? TITLES[2]

  const opacities = items.map((item) => {
    if (activeStep === 2) return 0.75
    if (activeStep === 0 && item.group === 0) return 0.75
    if (activeStep === 1 && item.group === 1) return 0.75
    return 0.15
  })

  const labelShow = items.map((_, i) => {
    if (activeStep === 2) return true
    if (activeStep === 0 && items[i].group === 0) return true
    if (activeStep === 1 && items[i].group === 1) return true
    return false
  })

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 600,
    animationEasing: 'cubicOut',
    title: {
      text: title,
      left: 'center',
      bottom: 0,
      textStyle: { color: MUTED, fontSize: mobile ? 9 : 11, fontWeight: 'normal', fontFamily: 'var(--font-mono)' },
    },
    legend: {
      top: 0,
      left: 10,
      itemGap: mobile ? 10 : 20,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: MUTED, fontSize: mobile ? 8 : 10 },
      data: [
        { name: 'Memory chips', itemStyle: { color: ACCENT } },
        { name: 'LNG carriers', itemStyle: { color: AMBER } },
        { name: 'Energy exposure', itemStyle: { color: RED } },
      ],
    },
    grid: mobile
      ? { left: 36, right: 16, top: 30, bottom: 40 }
      : { left: 50, right: 30, top: 40, bottom: 50 },
    xAxis: {
      type: 'category',
      data: items.map((i) => i.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: mobile ? 8 : 10, interval: 0 },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: MUTED, fontSize: mobile ? 8 : 10, formatter: '{value}%' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: LINE } },
    },
    series: [
      // Invisible series just for legend
      { name: 'Memory chips', type: 'bar', data: [], itemStyle: { color: ACCENT } },
      { name: 'LNG carriers', type: 'bar', data: [], itemStyle: { color: AMBER } },
      { name: 'Energy exposure', type: 'bar', data: [], itemStyle: { color: RED } },
      // Actual bars
      {
        type: 'bar',
        barWidth: '55%',
        data: items.map((item, i) => ({
          value: item.value,
          itemStyle: {
            color: item.color,
            opacity: opacities[i],
            borderRadius: [3, 3, 0, 0],
          },
          label: {
            show: labelShow[i],
            position: 'top',
            color: item.color,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            formatter: `${item.value}%`,
          },
        })),
      },
    ],
    tooltip: { show: false },
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ReactECharts
        option={option}
        style={{ height: mobile ? '100%' : 380, width: '100%', flex: mobile ? 1 : undefined }}
        opts={{ renderer: 'svg' }}
        notMerge={true}
      />
      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Sources: Counterpoint, KITA, BusinessKorea, VesselsValue, Carnegie Endowment.
      </div>
    </div>
  )
}
