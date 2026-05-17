'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const TITLES: Record<number, string> = {
  0: 'South Korea builds 84% of the world\'s LNG carriers — HD Hyundai, Samsung, Hanwha',
  1: 'Korean yards hold $71.3B in LNG orderbook — 2/3 of the global backlog by value',
}

export default function LNGCarrierTreemap({ activeStep }: { activeStep: number }) {
  const chart = useChartColors()
  const { teal: TEAL, accent2: ACCENT2, accent: ACCENT, muted: MUTED } = chart
  const mobile = useIsMobile()

  const carriers = [
    { name: 'HD Hyundai\n(Korea)', value: 34, color: ACCENT2, country: 'Korea' },
    { name: 'Samsung Heavy\n(Korea)', value: 28, color: ACCENT2, country: 'Korea' },
    { name: 'Hanwha Ocean\n(Korea)', value: 22, color: ACCENT2, country: 'Korea' },
    { name: 'COSCO\n(China)', value: 6, color: ACCENT, country: 'China' },
    { name: 'Hudong-Zhonghua\n(China)', value: 5, color: ACCENT, country: 'China' },
    { name: 'Chantiers de\nl\'Atlantique (EU)', value: 3, color: TEAL, country: 'Europe' },
    { name: 'Others', value: 2, color: MUTED, country: 'Other' },
  ]

  const title = TITLES[activeStep] ?? TITLES[0]

  const treemapData = carriers.map(d => ({
    name: d.name,
    value: d.value,
    itemStyle: {
      color: d.color,
      opacity: d.color === MUTED ? 0.3 : d.country === 'Korea' ? 0.85 : 0.55,
    },
    label: {
      show: true,
      formatter: `{name|${d.name}}\n{pct|${d.value}%}`,
      rich: {
        name: {
          color: d.color === MUTED ? chart.chromeTextDim : '#fff',
          fontFamily: 'var(--font-sans)',
          fontSize: mobile ? 8 : 10,
          lineHeight: mobile ? 12 : 15,
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
        text: 'Global LNG Carrier Deliveries 2021–2025 by shipyard',
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
      formatter: (params: any) => {
        const c = carriers.find(x => x.name === params.name)
        return `${String(params.name).replace(/\n/g, ' ')}: <strong>${params.value}%</strong> of deliveries<br/><span style="color:${MUTED}">${c?.country ?? ''}</span>`
      },
    },
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ReactECharts
        key={`lng-${activeStep}`}
        option={option}
        style={{ height: mobile ? '100%' : 340, width: '100%', flex: mobile ? 1 : undefined }}
        opts={{ renderer: 'svg' }}
        notMerge={true}
      />
      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Sources: BusinessKorea (248 vs 48 carrier deliveries, 2021-2025), VesselsValue ($71.3B orderbook).
      </div>
    </div>
  )
}
