'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import type { TradeWeb } from '@vismay/content-source/trade'
import {
  CHART_ACCENT,
  CHART_LINE_COLOR,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_TEXT,
  chapterColor,
  formatUsd,
  shortProductName,
} from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  web: TradeWeb
  /** Latest-year total exports per country (from the landscape) — sizes the
   *  nodes so the ring reads the same as the globe pins. */
  totalsByCode?: Record<string, number>
  onSelectCountry?: (code: string) => void
}

/**
 * Country↔country trade web: the tracked exporters on a ring, one directed
 * edge per (pair, HS2 chapter), width ∝ that chapter's flow volume, color =
 * chapter. Parallel chapter-edges between the same pair fan out via
 * autoCurveness; hover focuses a country's adjacency.
 */
export default function TradeWebNetwork({ web, totalsByCode, onSelectCountry }: Props) {
  const chapterRank = useMemo(
    () => new Map(web.chapters.map((c, i) => [c.hsCode, i])),
    [web.chapters],
  )
  const chapterNames = useMemo(
    () => new Map(web.chapters.map((c) => [c.hsCode, c.name])),
    [web.chapters],
  )
  const countryNames = useMemo(
    () => new Map(web.countries.map((c) => [c.code, c.name])),
    [web.countries],
  )

  const option = useMemo<EChartsOption>(() => {
    const totals = totalsByCode ?? {}
    const maxTotal = Math.max(1, ...web.countries.map((c) => totals[c.code] ?? 0))
    const degree = new Map<string, number>()
    for (const e of web.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + e.valueUsd)
      degree.set(e.to, (degree.get(e.to) ?? 0) + e.valueUsd)
    }
    const maxDegree = Math.max(1, ...degree.values())
    const maxEdge = Math.max(...web.edges.map((e) => e.valueUsd), 1)

    const nodes = web.countries.map((c) => {
      // Prefer the landscape's true export totals for sizing; fall back to
      // within-web degree when a country has no landscape row.
      const size = totals[c.code] != null && totals[c.code] > 0
        ? 12 + Math.sqrt(totals[c.code] / maxTotal) * 26
        : 12 + Math.sqrt((degree.get(c.code) ?? 0) / maxDegree) * 26
      return {
        id: c.code,
        name: c.name,
        symbolSize: size,
        itemStyle: { color: CHART_ACCENT },
        label: { show: true, fontSize: 10, color: '#c8d4d6' },
      }
    })

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: CHART_TOOLTIP_BG,
        borderColor: CHART_LINE_COLOR,
        textStyle: { color: CHART_TOOLTIP_TEXT, fontSize: 11 },
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const { source, target, hsCode, value } = params.data
            const lens = web.flow === 'export' ? 'exports as reported' : 'imports as reported'
            return (
              `<b>${countryNames.get(source) ?? source}</b> → <b>${countryNames.get(target) ?? target}</b><br/>` +
              `HS ${hsCode} ${shortProductName(chapterNames.get(hsCode) ?? '', 42)}<br/>` +
              `${formatUsd(value as number)} · ${web.year} · ${lens}`
            )
          }
          const code = String(params.data.id)
          const total = (totalsByCode ?? {})[code]
          return `<b>${params.data.name}</b>${total != null ? `<br/>${formatUsd(total)} exports · ${web.year}` : ''}`
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'circular',
          circular: { rotateLabel: true },
          roam: true,
          zoom: 0.82,
          // Parallel (pair, chapter) edges fan out instead of overlapping.
          autoCurveness: 24,
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: 5,
          data: nodes,
          links: web.edges.map((e) => ({
            source: e.from,
            target: e.to,
            value: e.valueUsd,
            hsCode: e.hsCode,
            lineStyle: {
              width: 0.6 + Math.sqrt(e.valueUsd / maxEdge) * 6,
              opacity: 0.2 + Math.sqrt(e.valueUsd / maxEdge) * 0.35,
              color: chapterColor(e.hsCode, chapterRank.get(e.hsCode) ?? 0),
            },
          })),
          itemStyle: { borderColor: 'rgba(233,241,242,0.35)', borderWidth: 0.6 },
          label: { position: 'right' },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { opacity: 0.9 },
          },
          blur: { itemStyle: { opacity: 0.15 }, lineStyle: { opacity: 0.03 } },
        },
      ],
    }
  }, [web, totalsByCode, chapterRank, chapterNames, countryNames])

  const onEvents = useMemo(
    () => ({
      click: (params: any) => {
        if (params?.dataType !== 'node') return
        const code = String(params.data?.id ?? '')
        if (code && onSelectCountry) onSelectCountry(code)
      },
    }),
    [onSelectCountry],
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chapter legend — the edge colors are meaningless without it. */}
      <div className="px-4 pt-2 pb-1 flex flex-wrap gap-x-3 gap-y-1 shrink-0">
        {web.chapters.slice(0, 8).map((c, i) => (
          <span key={c.hsCode} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block rounded-full"
              style={{ width: 7, height: 7, background: chapterColor(c.hsCode, i) }}
            />
            <span className="text-[9.5px] font-mono" style={{ color: '#8b98a5' }}>
              {c.hsCode} {shortProductName(c.name, 18)}
            </span>
          </span>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <ReactECharts
          option={option}
          onEvents={onEvents}
          style={{ height: '100%', width: '100%', minHeight: 300 }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  )
}
