'use client'

import type { DriverLane } from '../types'

type Props = {
  raceLabel: string
  lanes: DriverLane[]
  /** Optional total laps. Falls back to max lap across lanes. */
  totalLaps?: number
}

const PADDING = { top: 16, right: 12, bottom: 24, left: 28 }
const VIEW_W = 640
const VIEW_H = 320

export function PositionChart({ raceLabel, lanes, totalLaps }: Props) {
  if (lanes.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface text-sm text-muted">
        No lap data
      </div>
    )
  }

  const allPoints = lanes.flatMap((l) => l.points)
  const maxLap = totalLaps ?? Math.max(1, ...allPoints.map((p) => p.lap))
  const maxPos = Math.max(1, ...allPoints.map((p) => p.position))

  const xScale = (lap: number) =>
    PADDING.left +
    ((lap - 1) / Math.max(1, maxLap - 1)) * (VIEW_W - PADDING.left - PADDING.right)
  const yScale = (pos: number) =>
    PADDING.top +
    ((pos - 1) / Math.max(1, maxPos - 1)) * (VIEW_H - PADDING.top - PADDING.bottom)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted">Position by lap</span>
        <span className="truncate text-xs text-text">{raceLabel}</span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Position by lap chart for ${raceLabel}`}
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
        {/* X axis labels — lap 1, mid, last */}
        {[1, Math.ceil(maxLap / 2), maxLap].map((lap) => (
          <text
            key={lap}
            x={xScale(lap)}
            y={VIEW_H - 6}
            textAnchor="middle"
            className="fill-muted"
            style={{ fontSize: 10 }}
          >
            L{lap}
          </text>
        ))}
        {/* Lanes */}
        {lanes.map((lane) => {
          if (lane.points.length === 0) return null
          const d = lane.points
            .slice()
            .sort((a, b) => a.lap - b.lap)
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.lap)} ${yScale(p.position)}`)
            .join(' ')
          return (
            <path
              key={lane.driverId}
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
          <div key={lane.driverId} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: lane.color }}
            />
            <span className="text-text">{lane.driverCode ?? lane.driverName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
