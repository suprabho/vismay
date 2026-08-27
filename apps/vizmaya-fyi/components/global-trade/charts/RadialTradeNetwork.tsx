'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import type { TradeLandscape } from '@vismay/content-source/trade'
import {
  CHART_ACCENT,
  CHART_CHAPTER,
  CHART_LINE_COLOR,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_TEXT,
  formatUsd,
  shortProductName,
} from './colors'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  landscape: TradeLandscape
  /** Cap on HS-chapter nodes (edges to dropped chapters are hidden too) —
   *  the full 90+ chapter ring is unreadable below desktop sizes. */
  maxChapters?: number
  onSelectReporter?: (code: string) => void
}

/**
 * Radial trade-relations network: tracked reporters and HS2 chapters on one
 * ring, an edge per reporter→chapter top-export relationship, width and
 * opacity scaled by value. Hover focuses a node's adjacency, so "what does
 * Germany ship" and "who ships vehicles" are both one hover away.
 */
export default function RadialTradeNetwork({ landscape, maxChapters = 24, onSelectReporter }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const keptChapters = landscape.chapters.slice(0, maxChapters)
    const keptSet = new Set(keptChapters.map((c) => c.hsCode))
    const edges = landscape.edges.filter((e) => keptSet.has(e.hsCode))

    const maxReporter = Math.max(...landscape.reporters.map((r) => r.totalUsd), 1)
    const maxChapter = Math.max(...keptChapters.map((c) => c.totalUsd), 1)
    const maxEdge = Math.max(...edges.map((e) => e.valueUsd), 1)

    const reporterNames = new Map(landscape.reporters.map((r) => [r.code, r.name]))
    const chapterMeta = new Map(keptChapters.map((c) => [c.hsCode, c]))

    const nodes = [
      ...landscape.reporters.map((r) => ({
        id: `r:${r.code}`,
        name: r.name,
        value: r.totalUsd,
        category: 0,
        symbolSize: 14 + Math.sqrt(r.totalUsd / maxReporter) * 26,
        label: { show: true, fontSize: 10, color: '#c8d4d6' },
      })),
      ...keptChapters.map((c, i) => ({
        id: `c:${c.hsCode}`,
        name: `HS ${c.hsCode} · ${shortProductName(c.name, 22)}`,
        value: c.totalUsd,
        category: 1,
        symbolSize: 6 + Math.sqrt(c.totalUsd / maxChapter) * 18,
        // Only label the heavyweight chapters; the tail stays hover-only.
        label: { show: i < 10, fontSize: 8.5, color: '#a8977a' },
      })),
    ]

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: CHART_TOOLTIP_BG,
        borderColor: CHART_LINE_COLOR,
        textStyle: { color: CHART_TOOLTIP_TEXT, fontSize: 11 },
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            const [, reporter] = String(params.data.source).split(':')
            const [, hsCode] = String(params.data.target).split(':')
            const chapter = chapterMeta.get(hsCode)
            return `<b>${reporterNames.get(reporter) ?? reporter}</b> → HS ${hsCode}${
              chapter ? ` ${shortProductName(chapter.name, 40)}` : ''
            }<br/>${formatUsd(params.data.value as number)} · ${landscape.year}`
          }
          const [kind, key] = String(params.data.id).split(':')
          if (kind === 'c') {
            const chapter = chapterMeta.get(key)
            return `<b>HS ${key}</b> ${chapter?.name ?? ''}<br/>${formatUsd(
              params.data.value as number,
            )} across tracked exporters · ${landscape.year}`
          }
          return `<b>${params.data.name}</b><br/>${formatUsd(params.data.value as number)} exports · ${landscape.year}`
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'circular',
          circular: { rotateLabel: true },
          roam: true,
          // Slightly under-zoomed so rotated rim labels stay inside the
          // panel; users can roam/zoom for detail.
          zoom: 0.82,
          categories: [
            { name: 'Exporters', itemStyle: { color: CHART_ACCENT } },
            { name: 'HS chapters', itemStyle: { color: CHART_CHAPTER } },
          ],
          data: nodes,
          links: edges.map((e) => ({
            source: `r:${e.reporter}`,
            target: `c:${e.hsCode}`,
            value: e.valueUsd,
            lineStyle: {
              width: 0.6 + Math.sqrt(e.valueUsd / maxEdge) * 5,
              opacity: 0.16 + Math.sqrt(e.valueUsd / maxEdge) * 0.3,
              color: CHART_ACCENT,
              curveness: 0.28,
            },
          })),
          itemStyle: { borderColor: 'rgba(233,241,242,0.35)', borderWidth: 0.6 },
          label: { position: 'right' },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { opacity: 0.85 },
            label: { show: true },
          },
          blur: { itemStyle: { opacity: 0.18 }, lineStyle: { opacity: 0.04 } },
        },
      ],
    }
  }, [landscape, maxChapters])

  const onEvents = useMemo(
    () => ({
      click: (params: any) => {
        if (params?.dataType !== 'node') return
        const [kind, key] = String(params.data?.id ?? '').split(':')
        if (kind === 'r' && key && onSelectReporter) onSelectReporter(key)
      },
    }),
    [onSelectReporter],
  )

  return (
    <ReactECharts
      option={option}
      onEvents={onEvents}
      style={{ height: '100%', width: '100%', minHeight: 320 }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
