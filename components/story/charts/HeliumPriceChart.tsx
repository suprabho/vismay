'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

// Spot: NE Asia (IMARC Group). Contract: ChemAnalyst, DiscoveryAlert
// Mar 2026 spot NE Asia: $152.70/MCF (+21.5% MoM per IMARC)
const months = ['Sep 25', 'Oct 25', 'Nov 25', 'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26*', 'May 26*', 'Jun 26*']
const contractPrices = [560, 555, 548, 540, 535, 525, 520, 520, 680, 1050]
const spotPrices    = [128,  128,  128,  128,  128,  128,  153, 900, 1200, 1800]

const TITLES: Record<number, string> = {
  0: 'March 2026: Spot at $153/MCF — \n but it\'s only 2% of the market. Contracts unmoved.',
  1: 'Month 4-6: Force majeure triggers contract renegotiation. \n  The 98% starts moving toward $1,000-2,000.',
  2: 'Stockpile buffer: Samsung ~6 months + 18% recycling. TSMC 2+ months, 60-75% recycling rate.',
}

export default function HeliumPriceChart({ activeStep }: { activeStep: number }) {
  const { accent: ACCENT, green: TEAL, muted: MUTED, line: LINE } = useChartColors()
  const mobile = useIsMobile()
  const title = TITLES[activeStep] ?? TITLES[0]
  const showProjected = activeStep >= 1
  const sliceEnd = showProjected ? 10 : 7

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 800,
    animationEasing: 'cubicOut',
    title: {
      text: title,
      left: 'center',
      bottom: 0,
      textStyle: { color: MUTED, fontSize: mobile ? 9 : 11, fontWeight: 'normal', fontFamily: 'var(--font-mono)' },
    },
    grid: mobile
      ? { left: 40, right: 60, top: 28, bottom: 70 }
      : { left: 65, right: showProjected ? 110 : 80, top: 35, bottom: 50 },
    xAxis: {
      type: 'category',
      data: months,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: mobile ? 8 : 10, rotate: mobile ? 45 : 0 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 2000,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: mobile ? 8 : 10, formatter: '${value}' },
      splitLine: { lineStyle: { color: LINE } },
    },
    series: [
      {
        name: 'Spot (2% of market)',
        type: 'line',
        data: spotPrices.slice(0, sliceEnd).map((v, i) => (i < sliceEnd ? v : null)),
        smooth: 0.3,
        lineStyle: { color: ACCENT, width: 2.5, type: 'dashed' },
        symbol: 'none',
        endLabel: {
          show: true,
          color: ACCENT,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 700,
          formatter: () =>
            showProjected ? '$1,800+' : mobile ? '$153' : '$153 — spike',
        },
      },
      {
        name: 'Contract (98%)',
        type: 'line',
        data: contractPrices.slice(0, sliceEnd).map((v, i) => (i < sliceEnd ? v : null)),
        smooth: 0.3,
        lineStyle: { color: TEAL, width: 2.5 },
        symbol: 'none',
        endLabel: {
          show: true,
          color: TEAL,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 700,
          formatter: () =>
            showProjected
              ? mobile ? '$1,050' : '$1,050 — repricing'
              : mobile ? '$520' : '$520 — unmoved',
        },
      },
      // Projected zone highlight
      ...(showProjected
        ? [
            {
              type: 'line' as const,
              markArea: {
                silent: true,
                itemStyle: { color: 'rgba(216, 90, 48, 0.06)' },
                data: [[{ xAxis: 'Apr 26*' }, { xAxis: 'Jun 26*' }] as [{ xAxis: string }, { xAxis: string }]],
              },
              data: [] as number[],
            },
          ]
        : []),
    ],
    legend: {
      top: mobile ? 2 : 5,
      left: 10,
      itemGap: mobile ? 20 : 24,
      textStyle: { color: MUTED, fontSize: mobile ? 8 : 10, fontFamily: 'var(--font-mono)' },
      data: [
        { name: 'Spot (2% of market)', itemStyle: { color: ACCENT } },
        { name: 'Contract (98%)', itemStyle: { color: TEAL } },
      ],
    },
    tooltip: { show: false },
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ReactECharts
        option={option}
        style={{ height: mobile ? '100%' : 340, width: '100%', flex: mobile ? 1 : undefined }}
        opts={{ renderer: 'svg' }}
        notMerge={true}
      />
      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Sources: IMARC, ChemAnalyst, Phil Kornbluth (CNBC). *Projected if crisis extends.
      </div>
    </div>
  )
}
