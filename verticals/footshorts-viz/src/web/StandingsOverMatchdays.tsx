'use client'

import type { CSSProperties } from 'react'
import type { TeamLane } from '../types'

type Props = {
  /** Header label above the chart. Defaults to "League position by matchday". */
  title?: string
  /** Right-aligned context label, e.g. "Premier League · 2025/26". */
  competitionLabel: string
  lanes: TeamLane[]
  /** Optional total matchdays. Falls back to the max matchday across lanes. */
  totalMatchdays?: number
  /** Formatter for the three x-axis ticks. Defaults to `MD${n}`. */
  xTickFormat?: (value: number) => string
}

const PADDING = { top: 16, right: 12, bottom: 24, left: 28 }
const VIEW_W = 640
const VIEW_H = 320

// Inline styles + CSS vars instead of Tailwind utility classes so the chart
// renders correctly in host apps whose Tailwind config doesn't scan this
// package's source (notably vizmaya.fyi's story renderer and admin's preview,
// where utilities like `bg-surface` / `fill-muted` / `w-full` are never
// emitted and the SVG would otherwise collapse to zero size). Mirrors the
// approach already used by StandingsTable / MatchTile / the match-card layouts.
const cardStyle: CSSProperties = {
  width: '100%',
  borderRadius: '12px',
  border: '1px solid var(--color-line, #1f2a42)',
  background: 'var(--color-surface, #141d31)',
  padding: '12px',
  overflow: 'hidden',
}
const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '8px',
}
const titleStyle: CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted, #8a93a7)',
}
const labelStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--color-text, #eef2f8)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const svgStyle: CSSProperties = { display: 'block', width: '100%', height: 'auto' }
const legendStyle: CSSProperties = {
  marginTop: '12px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 12px',
}
const legendItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '11px',
  color: 'var(--color-text, #eef2f8)',
}
const emptyStyle: CSSProperties = {
  display: 'flex',
  height: '12rem',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px',
  border: '1px solid var(--color-line, #1f2a42)',
  background: 'var(--color-surface, #141d31)',
  color: 'var(--color-muted, #8a93a7)',
  fontSize: '14px',
}
const TICK_COLOR = 'var(--color-muted, #8a93a7)'
const GRID_COLOR = 'var(--color-line, #1f2a42)'

/**
 * League position over the course of a season — one polyline per team, P1 at the
 * top. A football twin of f1-viz's `PositionChart`: x-axis is matchday instead
 * of lap, and lanes are teams instead of drivers.
 */
export function StandingsOverMatchdays({
  title = 'League position by matchday',
  competitionLabel,
  lanes,
  totalMatchdays,
  xTickFormat = (n) => `MD${n}`,
}: Props) {
  if (lanes.length === 0) {
    return <div style={emptyStyle}>No matchday data</div>
  }

  const allPoints = lanes.flatMap((l) => l.points)
  const maxMD = totalMatchdays ?? Math.max(1, ...allPoints.map((p) => p.matchday))
  const maxPos = Math.max(1, ...allPoints.map((p) => p.position))

  const xScale = (md: number) =>
    PADDING.left +
    ((md - 1) / Math.max(1, maxMD - 1)) * (VIEW_W - PADDING.left - PADDING.right)
  // P1 maps to the top (PADDING.top); higher positions map downward — same as
  // f1-viz's PositionChart, so no inversion is needed.
  const yScale = (pos: number) =>
    PADDING.top +
    ((pos - 1) / Math.max(1, maxPos - 1)) * (VIEW_H - PADDING.top - PADDING.bottom)

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>{title}</span>
        <span style={labelStyle}>{competitionLabel}</span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={svgStyle}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`League position by matchday chart for ${competitionLabel}`}
      >
        {/* Y axis labels — P1, mid, last */}
        {[1, Math.ceil(maxPos / 2), maxPos].map((p) => (
          <g key={p}>
            <text
              x={PADDING.left - 6}
              y={yScale(p) + 3}
              textAnchor="end"
              fill={TICK_COLOR}
              style={{ fontSize: 10 }}
            >
              P{p}
            </text>
            <line
              x1={PADDING.left}
              y1={yScale(p)}
              x2={VIEW_W - PADDING.right}
              y2={yScale(p)}
              stroke={GRID_COLOR}
              strokeWidth={0.5}
            />
          </g>
        ))}
        {/* X axis labels — first, mid, last */}
        {[1, Math.ceil(maxMD / 2), maxMD].map((md) => (
          <text
            key={md}
            x={xScale(md)}
            y={VIEW_H - 6}
            textAnchor="middle"
            fill={TICK_COLOR}
            style={{ fontSize: 10 }}
          >
            {xTickFormat(md)}
          </text>
        ))}
        {/* Lanes */}
        {lanes.map((lane) => {
          if (lane.points.length === 0) return null
          const d = lane.points
            .slice()
            .sort((a, b) => a.matchday - b.matchday)
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${xScale(p.matchday)} ${yScale(p.position)}`,
            )
            .join(' ')
          return (
            <path
              key={lane.team_id}
              d={d}
              fill="none"
              stroke={lane.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
      </svg>
      <div style={legendStyle}>
        {lanes.map((lane) => (
          <div key={lane.team_id} style={legendItemStyle}>
            <span
              style={{
                display: 'inline-block',
                height: '8px',
                width: '8px',
                borderRadius: '999px',
                backgroundColor: lane.color,
              }}
            />
            <span>{lane.team_code ?? lane.team_name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
