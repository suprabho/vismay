'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

const TITLES: Record<number, string> = {
  0: "South Korea's triple exposure\n 3 supply lines, one chokepoint",
  1: 'Oil 70% + Helium 64.7% + Gas 26%\n All routed through the Strait of Hormuz',
  2: 'Every exposure hits the same industries\n semiconductor fabs and shipyards',
}

export default function PolarExposureChart({ activeStep }: { activeStep: number }) {
  const chart = useChartColors()
  const { accent: ACCENT, accent2: ACCENT2, green: HELIUM, muted: MUTED, line: LINE, surface: SURFACE } = chart
  const mobile = useIsMobile()

  const exposures = [
    { name: 'Oil', value: 70, color: ACCENT, desc: 'from the Middle East', detail: 'Naphtha feedstock for semiconductor chemicals' },
    { name: 'Helium', value: 64.7, color: HELIUM, desc: 'from Qatar', detail: 'Highest dependency of any major chip-producing nation' },
    { name: 'Gas (LNG)', value: 26, color: ACCENT2, desc: 'of electricity from gas', detail: 'Qatar declared force majeure on Korean contracts' },
  ]

  const title = TITLES[activeStep] ?? TITLES[0]

  // Highlight logic
  const getOpacity = (idx: number) => {
    if (activeStep === 0) return idx === 0 ? 1 : 0.25
    if (activeStep === 1) return idx === 1 ? 1 : 0.25
    if (activeStep === 2) return idx === 2 ? 1 : 0.25
    return 0.8
  }

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut',
    title: {
      text: title,
      left: 'center',
      bottom: 12,
      textStyle: { color: MUTED, fontSize: mobile ? 9 : 11, fontWeight: 'normal', fontFamily: 'var(--font-mono)', width: mobile ? 300 : 400, overflow: 'break' },
    },
    polar: { radius: mobile ? ['15%', '45%'] : ['20%', '55%'], center: ['50%', '42%'] },
    angleAxis: {
      type: 'category',
      data: exposures.map(e => e.name),
      startAngle: 75,
      axisLine: { lineStyle: { color: LINE } },
      axisTick: { show: false },
      axisLabel: {
        color: chart.chromeText,
        fontFamily: 'var(--font-sans)',
        fontSize: mobile ? 10 : 13,
        fontWeight: 600,
      },
      splitLine: { lineStyle: { color: LINE, opacity: 0.4 } },
    },
    radiusAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: LINE, opacity: 0.3 } },
    },
    series: [
      {
        type: 'bar',
        coordinateSystem: 'polar',
        data: exposures.map((e, i) => ({
          value: e.value,
          itemStyle: {
            color: e.color,
            opacity: getOpacity(i),
            borderRadius: 4,
          },
          label: {
            show: true,
            position: 'outside',
            formatter: `${e.value}%`,
            color: e.color,
            fontFamily: 'var(--font-mono)',
            fontSize: mobile ? 12 : 16,
            fontWeight: 700,
          },
        })),
        barMaxWidth: 60,
        roundCap: true,
        emphasis: { disabled: true },
      },
    ],
    tooltip: {
      show: true,
      backgroundColor: SURFACE,
      borderColor: LINE,
      borderWidth: 1,
      textStyle: { color: chart.chromeText, fontFamily: 'var(--font-mono)', fontSize: 11 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        const e = exposures[params.dataIndex]
        if (!e) return ''
        return `<strong>${e.name}</strong>: ${e.value}%<br/>${e.desc}<br/><span style="color:${MUTED};font-size:10px">${e.detail}</span>`
      },
    },
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
        className="text-center mt-1 pb-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Sources: KITA (helium 64.7%), Carnegie Endowment (oil 70%), IEEFA (gas 26%).
      </div>
    </div>
  )
}
