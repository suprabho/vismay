'use client'

import { useState, useRef } from 'react'
import { useInView } from '@/lib/use-in-view'
import { ScenarioToggleBlock } from '@/types/story'
import { useChartColors } from '@/lib/chartTheme'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '')
}

const SCENARIO_DATA = [
  {
    layers: [
      { name: 'Helium', value: 45, desc: '+40-50% spot' },
      { name: 'Korean energy', value: 50, desc: '+40-60% spot LNG' },
      { name: 'Petrochemicals', value: 12, desc: '+10-15%' },
      { name: 'Korean fab output', value: 0, desc: 'Stockpiles hold' },
      { name: 'GPU module', value: 1, desc: '+0-2%' },
      { name: 'Cloud GPU hour', value: 3, desc: '+2-4%' },
    ],
    total: '+2-4%',
  },
  {
    layers: [
      { name: 'Helium', value: 150, desc: '+100-200% contract' },
      { name: 'Korean energy', value: 30, desc: '+25-35% sustained' },
      { name: 'Petrochemicals', value: 25, desc: '+20-30%' },
      { name: 'Korean fab output', value: 20, desc: '-10-30% utilisation' },
      { name: 'GPU module', value: 12, desc: '+8-15%' },
      { name: 'Cloud GPU hour', value: 16, desc: '+12-20%' },
    ],
    total: '+12-20%',
  },
  {
    layers: [
      { name: 'Helium', value: 100, desc: 'New structural price floor' },
      { name: 'Korean energy', value: 18, desc: '+15-20% new normal' },
      { name: 'Petrochemicals', value: 12, desc: '+10-15% sustained' },
      { name: 'Korean fab output', value: 50, desc: 'Cost advantage lost' },
      { name: 'GPU module', value: 20, desc: '+15-25%' },
      { name: 'Cloud GPU hour', value: 40, desc: '+30-50%' },
    ],
    total: '+30-50%',
  },
]

export default function ScenarioToggle({ block }: { block: ScenarioToggleBlock }) {
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { threshold: 0.1 })
  const chartColors = useChartColors()
  const { chromeBg, chromeText, chromeTextDim } = chartColors
  const scenarioColors = [chartColors.teal, chartColors.amber, chartColors.accent]
  const color = scenarioColors[active]
  const data = SCENARIO_DATA[active]
  const labels = block.scenarios.map((s) => s.label)

  const chartOption = {
    backgroundColor: 'transparent',
    grid: { left: 130, right: 80, top: 10, bottom: 20 },
    xAxis: {
      type: 'value' as const,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category' as const,
      data: data.layers.map((l) => l.name).reverse(),
      axisLabel: {
        color: chromeText,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: data.layers.map((l) => l.value).reverse(),
        itemStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: color + '90' },
              { offset: 1, color },
            ],
          },
          borderRadius: [0, 4, 4, 0],
        },
        barWidth: '55%',
        label: {
          show: true,
          position: 'right' as const,
          color: chromeTextDim,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          formatter: (params: { dataIndex: number }) => {
            const idx = data.layers.length - 1 - params.dataIndex
            return data.layers[idx].desc
          },
        },
        animationDuration: 800,
        animationEasing: 'cubicOut' as const,
      },
    ],
    tooltip: {
      show: true,
      backgroundColor: chromeBg,
      borderColor: color,
      borderWidth: 1,
      textStyle: { color: chromeText, fontFamily: 'var(--font-mono)', fontSize: 12 },
      formatter: (params: { name: string; value: number; dataIndex: number }) => {
        const idx = data.layers.length - 1 - params.dataIndex
        return `<strong>${params.name}</strong><br/>${data.layers[idx].desc}`
      },
    },
  }

  return (
    <section ref={ref} className="py-8">
      {/* Tab buttons */}
      <div className="flex gap-2 justify-center mb-8 flex-wrap">
        {labels.map((label, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className="px-5 py-2 rounded-full font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.08em] transition-all duration-300 cursor-pointer"
            style={{
              border: `1px solid ${active === i ? scenarioColors[i] : 'var(--color-line, #1a2830)'}`,
              color: active === i ? scenarioColors[i] : 'var(--color-muted)',
              background: active === i ? `${scenarioColors[i]}15` : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div
        className="max-w-[860px] mx-auto px-4 transition-opacity duration-500"
        style={{ opacity: isInView ? 1 : 0 }}
      >
        <ReactECharts
          key={active}
          option={chartOption}
          style={{ height: 320 }}
          opts={{ renderer: 'svg' }}
          notMerge={true}
        />
      </div>

      {/* Total impact */}
      <div className="text-center mt-4 mb-12">
        <div
          className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.1em]"
          style={{ color: 'var(--color-muted)' }}
        >
          End-to-end GPU hour impact
        </div>
        <div
          className="font-[family-name:var(--font-serif)] text-[2.5rem] font-bold mt-1 transition-all duration-500"
          style={{ color }}
        >
          {data.total}
        </div>
      </div>
    </section>
  )
}
