'use client'

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
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface text-sm text-muted">
        No matchday data
      </div>
    )
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
    <div className="overflow-hidden rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted">{title}</span>
        <span className="truncate text-xs text-text">{competitionLabel}</span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full"
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
              className="fill-muted"
              style={{ fontSize: 10 }}
            >
              P{p}
            </text>
            <line
              x1={PADDING.left}
              y1={yScale(p)}
              x2={VIEW_W - PADDING.right}
              y2={yScale(p)}
              stroke="currentColor"
              className="text-border"
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
            className="fill-muted"
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
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {lanes.map((lane) => (
          <div key={lane.team_id} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: lane.color }}
            />
            <span className="text-text">{lane.team_code ?? lane.team_name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
