'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const labels = ["Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25", "Q1 '26", 'Q2 \'26\n(60d)', 'Q2 \'26\n(6mo)', 'Q2 \'26\n(3-5yr)']
const preExisting = [20, 45, 80, 120, 172, 172, 172, 172]
const hormuzIncrement = [0, 0, 0, 0, 0, 3, 18, 40]

const TITLES: Record<number, string> = {
  0: 'The fire already burning: DRAM +172% before Hormuz',
  1: 'At 60 days: Hormuz is a rounding error on the supercycle',
  2: 'At 6 months: Korean stockpiles thin. The increment surfaces.',
  3: 'At 3-5 years: structural reset \u2014 Korean cost advantage erodes',
}

export default function DRAMPriceChart({ activeStep }: { activeStep: number }) {
  const { accent: ACCENT, accent2: ACCENT2, muted: MUTED, line: LINE } = useChartColors()
  const mobile = useIsMobile()
  const title = TITLES[activeStep] ?? TITLES[0]
  const showHormuzLegend = activeStep >= 1

  const preOpacities = preExisting.map((_, i) => {
    if (activeStep === 0) return i < 5 ? 0.75 : 0.15
    if (activeStep === 1) return i <= 5 ? 0.75 : 0.15
    return 0.75
  })

  const hormuzOpacities = hormuzIncrement.map((val, i) => {
    if (activeStep === 0) return 0
    if (activeStep === 1) return i === 5 ? 0.8 : 0
    if (activeStep === 2) return i >= 5 && val > 0 ? 0.8 : 0
    return val > 0 ? 0.8 : 0
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
      itemGap: mobile ? 12 : 24,
      textStyle: { color: MUTED, fontSize: mobile ? 8 : 10 },
      data: [
        { name: 'Pre-existing supercycle', itemStyle: { color: ACCENT2 } },
        ...(showHormuzLegend
          ? [{ name: 'Hormuz increment', itemStyle: { color: ACCENT } }]
          : []),
      ],
    },
    grid: mobile
      ? { left: 40, right: 16, top: 30, bottom: 40 }
      : { left: 60, right: 30, top: 40, bottom: 50 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: mobile ? 8 : 10, interval: 0, rotate: mobile ? 30 : 0 },
    },
    yAxis: {
      type: 'value',
      max: 230,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: mobile ? 8 : 10, formatter: '{value}%' },
      splitLine: { lineStyle: { color: LINE } },
    },
    series: [
      {
        name: 'Pre-existing supercycle',
        type: 'bar',
        stack: 'total',
        barWidth: '55%',
        data: preExisting.map((val, i) => ({
          value: val,
          itemStyle: {
            color: ACCENT2,
            opacity: preOpacities[i],
            borderRadius: hormuzOpacities[i] > 0 ? [0, 0, 0, 0] : [3, 3, 0, 0],
          },
        })),
      },
      {
        name: 'Hormuz increment',
        type: 'bar',
        stack: 'total',
        barWidth: '55%',
        data: hormuzIncrement.map((val, i) => ({
          value: val,
          itemStyle: {
            color: ACCENT,
            opacity: hormuzOpacities[i],
            borderRadius: [3, 3, 0, 0],
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
        style={{ height: mobile ? '100%' : 360, width: '100%', flex: mobile ? 1 : undefined }}
        opts={{ renderer: 'svg' }}
        notMerge={true}
      />
      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Sources: TrendForce, Counterpoint, IDC, Gartner. Hormuz increment estimated from helium + energy pass-through.
      </div>
    </div>
  )
}
