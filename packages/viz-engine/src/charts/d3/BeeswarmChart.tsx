'use client'

import { useMemo } from 'react'
import { max } from 'd3-array'
import { scaleLinear } from 'd3-scale'
import { format } from 'd3-format'
import { useChartColors, useIsMobile } from '../../lib/chartTheme'
import type { ChartRenderProps } from '../_shared/types'

/**
 * First D3-family chart, proving the engine runs in parallel with ECharts
 * through the same contract:
 *   - theme via `useChartColors()` (story frontmatter reflows it)
 *   - responsive via `useIsMobile()`
 *   - `activeStep` drives scrolly highlighting, like the ECharts charts
 *   - readiness is signalled by the chart module wrapper (see _shared/types.ts)
 *
 * It uses D3 only for the math (scales + ticks) and renders the SVG with
 * React/JSX — the modern, SSR-friendly split. The dodge is a deterministic
 * Wilkinson-style dot stack (no force simulation), so headless PDF/share
 * capture rasterises the same layout every run.
 *
 * Per the import guardrails this file may import `d3-*` but never `echarts`.
 */

interface Datum {
  name: string
  /** Helium production capacity, million scf/yr (illustrative sample data). */
  value: number
  group: 'Qatar' | 'United States' | 'Other'
}

// Illustrative sample distribution — enough points to show the swarm shape.
const DATA: Datum[] = [
  { name: 'Ras Laffan Helium 2', value: 1300, group: 'Qatar' },
  { name: 'Ras Laffan Helium 1', value: 660, group: 'Qatar' },
  { name: 'Ras Laffan Helium 3', value: 425, group: 'Qatar' },
  { name: 'Al Khaleej', value: 240, group: 'Qatar' },
  { name: 'Cliffside', value: 880, group: 'United States' },
  { name: 'Hugoton A', value: 520, group: 'United States' },
  { name: 'Hugoton B', value: 470, group: 'United States' },
  { name: 'Riley Ridge', value: 360, group: 'United States' },
  { name: 'Keyes', value: 230, group: 'United States' },
  { name: 'Big Piney', value: 180, group: 'United States' },
  { name: 'Doe Canyon', value: 150, group: 'United States' },
  { name: 'Ladder Creek', value: 120, group: 'United States' },
  { name: 'Amur (RU)', value: 690, group: 'Other' },
  { name: 'Arzew (DZ)', value: 410, group: 'Other' },
  { name: 'Skikda (DZ)', value: 290, group: 'Other' },
  { name: 'Darwin (AU)', value: 210, group: 'Other' },
  { name: 'Mereenie (AU)', value: 150, group: 'Other' },
  { name: 'Odolanów (PL)', value: 95, group: 'Other' },
  { name: 'Tianjin (CN)', value: 80, group: 'Other' },
  { name: 'Kapuni (NZ)', value: 60, group: 'Other' },
]

const GROUP_ORDER: Datum['group'][] = ['Qatar', 'United States', 'Other']

export default function BeeswarmChart({ activeStep = 0 }: ChartRenderProps) {
  const colors = useChartColors()
  const mobile = useIsMobile()

  // activeStep 0 = show everything; 1..n highlights one group, dims the rest.
  const highlightGroup = activeStep > 0 ? GROUP_ORDER[(activeStep - 1) % GROUP_ORDER.length] : null

  const groupColor: Record<Datum['group'], string> = {
    Qatar: colors.accent,
    'United States': colors.accent2,
    Other: colors.teal,
  }

  const width = mobile ? 340 : 720
  const height = mobile ? 300 : 360
  const margin = { top: 24, right: 20, bottom: 44, left: 20 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom
  const centerY = margin.top + innerH / 2
  const r = mobile ? 5 : 6

  const { nodes, ticks } = useMemo(() => {
    const domainMax = max(DATA, (d) => d.value) ?? 0
    const x = scaleLinear().domain([0, domainMax]).nice().range([margin.left, margin.left + innerW])

    // Deterministic dot stack: bucket points into circle-wide columns, then
    // fan them out vertically around the centre line.
    const colWidth = r * 2
    const rowGap = r * 2 + 1
    const columns = new Map<number, Datum[]>()
    for (const d of [...DATA].sort((a, b) => b.value - a.value)) {
      const col = Math.round(x(d.value) / colWidth)
      const bucket = columns.get(col)
      if (bucket) bucket.push(d)
      else columns.set(col, [d])
    }

    const placed: { d: Datum; cx: number; cy: number }[] = []
    for (const [, bucket] of columns) {
      bucket.forEach((d, i) => {
        // 0, +1, -1, +2, -2 … so columns grow symmetrically from the axis.
        const slot = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1)
        placed.push({ d, cx: x(d.value), cy: centerY + slot * rowGap })
      })
    }

    const fmt = format('~s')
    const tickValues = x.ticks(mobile ? 4 : 6)
    return {
      nodes: placed,
      ticks: tickValues.map((t) => ({ value: t, x: x(t), label: fmt(t) })),
    }
  }, [mobile, r, innerW, centerY, margin.left])

  return (
    <div className="w-full h-full flex flex-col">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', minHeight: mobile ? 280 : 360 }}
        role="img"
        aria-label="Beeswarm of helium production capacity by source"
      >
        {/* baseline */}
        <line
          x1={margin.left}
          x2={margin.left + innerW}
          y1={height - margin.bottom}
          y2={height - margin.bottom}
          stroke={colors.line}
          strokeWidth={1}
        />
        {/* x ticks */}
        {ticks.map((t) => (
          <g key={t.value} transform={`translate(${t.x},${height - margin.bottom})`}>
            <line y2={5} stroke={colors.line} strokeWidth={1} />
            <text
              y={18}
              textAnchor="middle"
              fill={colors.chromeTextDim}
              style={{ fontFamily: 'var(--font-mono)', fontSize: mobile ? 9 : 11 }}
            >
              {t.label}
            </text>
          </g>
        ))}
        {/* swarm */}
        {nodes.map(({ d, cx, cy }) => {
          const dimmed = highlightGroup !== null && d.group !== highlightGroup
          return (
            <circle
              key={d.name}
              cx={cx}
              cy={cy}
              r={r}
              fill={groupColor[d.group]}
              opacity={dimmed ? 0.2 : 0.9}
              stroke={colors.chromeBg}
              strokeWidth={0.75}
            >
              <title>{`${d.name}: ${d.value}M scf/yr`}</title>
            </circle>
          )
        })}
        {/* legend */}
        {GROUP_ORDER.map((g, i) => (
          <g key={g} transform={`translate(${margin.left + i * (mobile ? 100 : 150)},${margin.top - 12})`}>
            <circle cx={5} cy={-4} r={5} fill={groupColor[g]} opacity={highlightGroup && g !== highlightGroup ? 0.2 : 0.9} />
            <text
              x={16}
              y={0}
              fill={colors.chromeText}
              style={{ fontFamily: 'var(--font-sans)', fontSize: mobile ? 10 : 12, fontWeight: 600 }}
            >
              {g}
            </text>
          </g>
        ))}
      </svg>
      <div
        className="text-center mt-1 pb-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        Helium production capacity by source (M scf/yr) — illustrative sample data. Rendered with D3 + React/SVG.
      </div>
    </div>
  )
}
