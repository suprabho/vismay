'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const TITLES: Record<number, string> = {
  0: 'Global HBM market: South Korea holds 90% \n every AI GPU depends on it',
  1: 'Global DRAM market: Korea dominates;\n Micron is the only non-Korean alternative',
  2: 'Combined: Korea produces the memory that  \n the world cannot build AI without',
}

export default function HBMDRAMTreemap({ activeStep }: { activeStep: number }) {
  const chart = useChartColors()
  const { accent: ACCENT, accent2: ACCENT2, teal: TEAL, muted: MUTED } = chart
  const mobile = useIsMobile()

  const hbmData = [
    { name: 'SK Hynix\n(Korea)', value: 62, color: ACCENT2 },
    { name: 'Samsung\n(Korea)', value: 28, color: ACCENT2 },
    { name: 'Micron\n(USA)', value: 10, color: TEAL },
  ]
  const dramData = [
    { name: 'Samsung\n(Korea)', value: 33, color: ACCENT2 },
    { name: 'SK Hynix\n(Korea)', value: 28, color: ACCENT2 },
    { name: 'Micron\n(USA)', value: 24, color: TEAL },
    { name: 'CXMT\n(China)', value: 8, color: ACCENT },
    { name: 'Others', value: 7, color: MUTED },
  ]

  const title = TITLES[activeStep] ?? TITLES[0]
  const isHBM = activeStep <= 0
  const data = isHBM ? hbmData : dramData
  const subtitle = isHBM ? 'HBM (High Bandwidth Memory) — 2026' : 'DRAM Global Market Share — 2026'

  const treemapData = data.map(d => ({
    name: d.name,
    value: d.value,
    itemStyle: { color: d.color, opacity: d.color === MUTED ? 0.35 : d.color === ACCENT ? 0.85 : 0.7 },
    label: {
      show: true,
      formatter: `{name|${d.name}}\n{pct|${d.value}%}`,
      rich: {
        name: {
          color: '#fff',
          fontFamily: 'var(--font-sans)',
          fontSize: mobile ? 9 : 11,
          lineHeight: mobile ? 13 : 16,
        },
        pct: {
          color: d.color === MUTED ? chart.chromeTextDim : '#fff',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: mobile ? 11 : 14,
          lineHeight: mobile ? 16 : 20,
        },
      },
    },
  }))

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut',
    title: [
      {
        text: subtitle,
        left: 'center',
        top: 4,
        textStyle: { color: MUTED, fontSize: mobile ? 8 : 10, fontWeight: 'normal', fontFamily: 'var(--font-mono)' },
      },
      {
        text: title,
        left: 'center',
        bottom: 0,
        textStyle: { color: MUTED, fontSize: mobile ? 9 : 11, fontWeight: 'normal', fontFamily: 'var(--font-mono)' },
      },
    ],
    series: [
      {
        type: 'treemap',
        top: 28,
        bottom: 30,
        left: 4,
        right: 4,
        data: treemapData,
        breadcrumb: { show: false },
        roam: false,
        nodeClick: false,
        emphasis: { disabled: true },
        levels: [
          {
            itemStyle: { borderWidth: 2, borderColor: '#0a0e14', gapWidth: 3 },
          },
        ],
        label: {
          position: 'inside',
          align: 'center',
          verticalAlign: 'middle',
        },
      },
    ],
    tooltip: {
      show: true,
      backgroundColor: chart.chromeBg,
      borderColor: chart.line,
      textStyle: { color: chart.chromeText, fontFamily: 'var(--font-mono)', fontSize: 11 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) =>
        `${String(params.name).replace(/\n/g, ' ')}: <strong>${params.value}%</strong>`,
    },
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ReactECharts
        key={`${activeStep}`}
        option={option}
        style={{ height: mobile ? '100%' : 360, width: '100%', flex: mobile ? 1 : undefined }}
        opts={{ renderer: 'svg' }}
        notMerge={true}
      />
      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Sources: Counterpoint Research (HBM Q2 2025), TrendForce, IDC. DRAM shares are 2026 estimates.
      </div>
    </div>
  )
}
