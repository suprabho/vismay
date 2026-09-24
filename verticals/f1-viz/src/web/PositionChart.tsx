'use client'

import { useId } from 'react'

import type { DriverLane, LapPosition } from '../types'

/** A shaded lap range drawn behind the lines (e.g. a safety car / VSC period). */
export type LapBand = { from: number; to: number; label?: string }

type Props = {
  raceLabel: string
  lanes: DriverLane[]
  /** Optional total laps. Falls back to max lap across lanes. */
  totalLaps?: number
  /** Header label above the chart. Defaults to "Position by lap". */
  title?: string
  /** Formatter for the three x-axis ticks. Defaults to `L${n}`. */
  xTickFormat?: (value: number) => string
  /**
   * Zoom to a lap range: the x-axis spans it, the y-axis fits the positions
   * visited inside it, and each lane is cut to the window (its position on the
   * window's first/last lap is carried in from the nearest earlier point, so a
   * sparse, change-only series still draws flat stints correctly).
   */
  lapWindow?: { from: number; to: number }
  /** Driver codes (or ids) to emphasise; every other lane is dimmed. */
  highlight?: string[]
  /** Shaded lap ranges behind the lines — safety car / VSC periods. */
  bands?: LapBand[]
}

/** The lane's position on `lap`: its last point at or before it (a step series). */
function positionOn(points: LapPosition[], lap: number): number | null {
  let pos: number | null = null
  for (const p of points) {
    if (p.lap > lap) break
    pos = p.position
  }
  return pos
}

/** Cut a lane's points to a lap window, pinning its position at both edges. */
function windowPoints(points: LapPosition[], from: number, to: number): LapPosition[] {
  const sorted = [...points].sort((a, b) => a.lap - b.lap)
  const inside = sorted.filter((p) => p.lap > from && p.lap < to)
  const start = positionOn(sorted, from)
  const end = positionOn(sorted, to)
  return [
    ...(start != null ? [{ lap: from, position: start }] : []),
    ...inside,
    ...(end != null ? [{ lap: to, position: end }] : []),
  ]
}

// Right padding keeps the end-of-line driver avatars inside the viewBox.
const PADDING = { top: 16, right: 16, bottom: 24, left: 28 }
const VIEW_W = 640
// Base plot height. The chart grows beyond it when the position span needs
// more room for the avatars (see MIN_POS_STEP).
const BASE_PLOT_H = 280
// End-of-line avatar radius, in viewBox units.
const AVATAR_R = 11
// Minimum vertical distance between adjacent positions. Final standings sit on
// consecutive positions, so a step of at least one avatar diameter (plus a
// little air) keeps the end-of-line avatars from overlapping.
const MIN_POS_STEP = AVATAR_R * 2 + 4

function initialsFor(lane: DriverLane): string {
  if (lane.driverCode) return lane.driverCode
  return lane.driverName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
}

export function PositionChart({
  raceLabel,
  lanes,
  totalLaps,
  title = 'Position by lap',
  xTickFormat = (n) => `L${n}`,
  lapWindow,
  highlight,
  bands,
}: Props) {
  // Unique per-instance prefix so clipPath ids don't collide when several
  // PositionCharts render on one page. useId can contain colons, which are
  // invalid inside url(#…) references, so strip them.
  const uid = useId().replace(/:/g, '')

  const win =
    lapWindow && lapWindow.to > lapWindow.from ? lapWindow : undefined
  if (win) {
    lanes = lanes
      .map((l) => ({ ...l, points: windowPoints(l.points, win.from, win.to) }))
      .filter((l) => l.points.length > 0)
  }
  // Teammates share a team colour: draw each team's second (and later) car
  // dashed so the two lines — and legend entries — stay distinguishable.
  const seenColours = new Set<string>()
  const dashedIds = new Set<string>()
  for (const l of lanes) {
    const c = l.color.toLowerCase()
    if (seenColours.has(c)) dashedIds.add(l.driverId)
    else seenColours.add(c)
  }
  const emphasised = new Set((highlight ?? []).map((h) => h.toUpperCase()))
  const isHighlighted = (l: DriverLane) =>
    emphasised.size === 0 ||
    emphasised.has((l.driverCode ?? '').toUpperCase()) ||
    emphasised.has(l.driverId.toUpperCase())

  if (lanes.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface text-sm text-muted">
        No lap data
      </div>
    )
  }

  const allPoints = lanes.flatMap((l) => l.points)
  const maxLap = win ? win.to : totalLaps ?? Math.max(1, ...allPoints.map((p) => p.lap))
  // Start the x-axis at the first datapoint, not a hardcoded 1. A lap-based
  // race chart still starts at lap 1, but a standings-by-round chart starts at
  // the season's first *raced* round — F1 seasons open with pre-season testing
  // (round 1/2, no points), so forcing the axis to R1 drew a misleading empty
  // band before the opening race.
  const minLap = win ? win.from : Math.min(maxLap, ...allPoints.map((p) => p.lap))
  // A zoomed chart fits the positions it actually shows (P1–P6, not P1–P22).
  const minPos = win ? Math.min(...allPoints.map((p) => p.position)) : 1
  const maxPos = Math.max(minPos + 1, ...allPoints.map((p) => p.position))

  // Grow the plot when a wide position span (e.g. a P22 → P1 recovery
  // stretching the axis) would otherwise squeeze adjacent positions closer
  // than an avatar diameter.
  const plotH = Math.max(BASE_PLOT_H, (maxPos - minPos) * MIN_POS_STEP)
  const viewH = PADDING.top + plotH + PADDING.bottom

  const xScale = (lap: number) =>
    PADDING.left +
    ((lap - minLap) / Math.max(1, maxLap - minLap)) * (VIEW_W - PADDING.left - PADDING.right)
  const yScale = (pos: number) =>
    PADDING.top + ((pos - minPos) / Math.max(1, maxPos - minPos)) * plotH

  // End-of-line avatar markers, centred on each lane's actual final point —
  // same idiom as footshorts' StandingsOverMatchdays crests. Rendered in
  // reverse lane order so the first lane (championship leader) paints on top
  // where endpoints sit close together.
  const markers = lanes
    .filter((l) => l.points.length > 0)
    .map((lane) => {
      const last = [...lane.points].sort((a, b) => a.lap - b.lap).at(-1)!
      return { lane, cx: xScale(last.lap), cy: yScale(last.position) }
    })
    .reverse()

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted">{title}</span>
        <span className="truncate text-xs text-text">{raceLabel}</span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Position by lap chart for ${raceLabel}`}
      >
        <defs>
          {markers.map((m, i) =>
            m.lane.headshotUrl ? (
              <clipPath key={i} id={`hc-${uid}-${i}`}>
                <circle cx={m.cx} cy={m.cy} r={AVATAR_R - 1.5} />
              </clipPath>
            ) : null,
          )}
        </defs>
        {/* Shaded periods (safety car / VSC), behind everything else */}
        {(bands ?? [])
          .filter((b) => b.to >= minLap && b.from <= maxLap)
          .map((b, i) => {
            const x1 = xScale(Math.max(minLap, b.from - 0.5))
            const x2 = xScale(Math.min(maxLap, b.to + 0.5))
            return (
              <g key={`band-${i}`}>
                <rect
                  x={x1}
                  y={PADDING.top - 8}
                  width={Math.max(2, x2 - x1)}
                  height={plotH + 8}
                  fill="var(--color-amber, #FACC15)"
                  opacity={0.14}
                />
                {b.label && (
                  <text fontFamily="var(--font-mono, monospace)"
                    x={(x1 + x2) / 2}
                    y={PADDING.top - 10}
                    textAnchor="middle"
                    className="fill-muted"
                    style={{ fontSize: 9, letterSpacing: '0.08em' }}
                  >
                    {b.label}
                  </text>
                )}
              </g>
            )
          })}
        {/* Y axis labels — every position on a short (zoomed) span, else first/mid/last */}
        {(maxPos - minPos <= 7
          ? Array.from({ length: maxPos - minPos + 1 }, (_, i) => minPos + i)
          : [...new Set([minPos, Math.round((minPos + maxPos) / 2), maxPos])]
        ).map((p) => (
          <g key={p}>
            <text fontFamily="var(--font-mono, monospace)"
              x={PADDING.left - 6}
              y={yScale(p) + 3}
              textAnchor="end"
              className="fill-muted"
              style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '100%', fontSize: 10 }}
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
        {/* X axis labels — first, mid, last (deduped for a 1- or 2-round span) */}
        {[...new Set([minLap, Math.round((minLap + maxLap) / 2), maxLap])].map((lap) => (
          <text fontFamily="var(--font-mono, monospace)"
            key={lap}
            x={xScale(lap)}
            y={viewH - 6}
            textAnchor="middle"
            className="fill-muted"
            style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '100%', fontSize: 10 }}
          >
            {xTickFormat(lap)}
          </text>
        ))}
        {/* Lanes */}
        {[...lanes].sort((a, b) => Number(isHighlighted(a)) - Number(isHighlighted(b))).map((lane) => {
          if (lane.points.length === 0) return null
          const on = isHighlighted(lane)
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
              strokeWidth={on && emphasised.size > 0 ? 2.75 : 1.5}
              strokeDasharray={dashedIds.has(lane.driverId) ? '6 4' : undefined}
              opacity={on ? 1 : 0.28}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
        {/* End-of-line driver avatars (photo, or code monogram fallback) */}
        {markers.map((m, i) => (
          <g key={m.lane.driverId} opacity={isHighlighted(m.lane) ? 1 : 0.35}>
            <circle cx={m.cx} cy={m.cy} r={AVATAR_R} fill="var(--color-surface)" />
            {m.lane.headshotUrl ? (
              <image
                href={m.lane.headshotUrl}
                x={m.cx - (AVATAR_R - 1.5)}
                y={m.cy - (AVATAR_R - 1.5)}
                width={(AVATAR_R - 1.5) * 2}
                height={(AVATAR_R - 1.5) * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#hc-${uid}-${i})`}
              />
            ) : (
              <text fontFamily="var(--font-mono, monospace)"
                x={m.cx}
                y={m.cy}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-text"
                style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '100%', fontSize: 8, fontWeight: 600 }}
              >
                {initialsFor(m.lane)}
              </text>
            )}
            <circle
              cx={m.cx}
              cy={m.cy}
              r={AVATAR_R}
              fill="none"
              stroke={m.lane.color}
              strokeWidth={1.5}
            />
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {lanes.map((lane) => (
          <div key={lane.driverId} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={
                dashedIds.has(lane.driverId)
                  ? { border: `1.5px solid ${lane.color}` }
                  : { backgroundColor: lane.color }
              }
            />
            <span className="text-text">{lane.driverCode ?? lane.driverName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
