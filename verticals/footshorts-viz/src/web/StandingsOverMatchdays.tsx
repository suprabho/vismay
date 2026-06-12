'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Crest } from '../data/Crest'
import type { TeamLane } from '../types'

type Props = {
  /** Header label above the chart. Defaults to "League position by matchday". */
  title?: string
  /** Right-aligned context label, e.g. "Premier League · 2025/26". */
  competitionLabel: string
  lanes: TeamLane[]
  /**
   * Optional total matchdays — pins the right edge of the axis. Falls back to
   * the max matchday across lanes. Superseded by `matchdayRange.to` when set.
   */
  totalMatchdays?: number
  /**
   * Optional explicit matchday window for the x-axis. `from` pins the left
   * origin; when omitted it defaults to the first matchday present in the data,
   * so a trimmed series (e.g. starting at MD20) fills the plot instead of
   * leaving the MD1→MD20 stretch blank. `to` pins the right edge and takes
   * precedence over `totalMatchdays`.
   */
  matchdayRange?: { from?: number; to?: number }
  /** Formatter for the three x-axis ticks. Defaults to `MD${n}`. */
  xTickFormat?: (value: number) => string
  /**
   * Whether to play the line-draw + crest entrance animation. Defaults to true
   * for live viewing. The viz module passes `false` for capture/print so the
   * headless snapshot rasterises the final, fully-drawn frame — mirroring
   * StoryEChart, which disables ECharts animation in capture mode.
   */
  animate?: boolean
  /**
   * When the entrance starts. `'in-view'` (default) holds the chart blank until
   * it scrolls into the viewport, then draws — and replays on every re-entry.
   * `'mount'` starts immediately (the pre-existing behaviour) — for hosts that
   * only mount the chart once it's already on screen, or hidden/headless pages
   * where IntersectionObserver never fires. Environments without
   * IntersectionObserver fall back to mount behaviour automatically.
   */
  trigger?: 'in-view' | 'mount'
  /**
   * Replay the entrance continuously while the chart is on screen. Each cycle
   * rests on the fully-drawn frame for a beat before redrawing. Paused while
   * off-screen (the next cycle starts on re-entry).
   */
  loop?: boolean
  /**
   * How long each loop cycle rests on the fully-drawn frame before the next
   * replay, in milliseconds. Defaults to 1600. Only meaningful with `loop`.
   */
  loopDelayMs?: number
}

const PADDING = { top: 16, right: 12, bottom: 24, left: 28 }
const VIEW_W = 640
const VIEW_H = 320

// Lane-emphasis + animation tunables.
const BASE_WIDTH = 1.5 // default stroke (unchanged from before)
const HIGHLIGHT_WIDTH = 3 // bump when a lane is flagged `highlight` with no explicit width
const DIM_OPACITY = 0.28 // opacity for non-highlighted lanes + legend when a highlight is active
const DRAW_MS = 900 // line-draw duration per lane
const STAGGER_MS = 100 // per-lane draw stagger
const CREST_IN_MS = 360 // crest pop-in duration
const CREST_SIZE = 40 // crest diameter (px) at each lane's endpoint
const CREST_SIZE_HIGHLIGHT = 80 // larger crest for the highlighted lane
const LOOP_HOLD_MS = 1600 // default rest on the final frame between loop replays (`loopDelayMs` overrides)
const IN_VIEW_THRESHOLD = 0.3 // fraction of the card visible before the draw starts
// Total entrance time stays well under the viz-engine's post-ready settle window
// (~2s), so the snapshot — taken after readiness — always lands on the final
// frame even when `animate` is left on. Capture/print disable it anyway.

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
// The plot wrapper is `position: relative` so crests can be overlaid as HTML at
// each lane's endpoint. The svg keeps width:100%/height:auto with a 2:1 viewBox,
// so percentage-positioned crests line up exactly with the svg coordinate space.
const plotWrapStyle: CSSProperties = { position: 'relative', width: '100%' }
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


// Scoped @keyframes for the entrance. Global names are fine (identical rules
// dedupe), and rendering the block only when animating keeps capture output
// free of unused style. `forwards` / `both` rest the elements in their final
// state, so a frame captured after the animation reads correctly.
const KEYFRAMES = `
@keyframes som-draw { to { stroke-dashoffset: 0; } }
@keyframes som-crest-in { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
`

/**
 * League position over the course of a season — one polyline per team, P1 at the
 * top. A football twin of f1-viz's `PositionChart`: x-axis is matchday instead
 * of lap, and lanes are teams instead of drivers.
 *
 * A lane flagged `highlight` is drawn thicker, fully opaque and on top while the
 * rest of the pack (lines + legend) dims, so a single club's run stands out. Each
 * lane also ends in its crest, and the lines draw in on first view.
 */
export function StandingsOverMatchdays({
  title = 'League position by matchday',
  competitionLabel,
  lanes,
  totalMatchdays,
  matchdayRange,
  xTickFormat = (n) => `MD${n}`,
  animate = true,
  trigger = 'in-view',
  loop = false,
  loopDelayMs = LOOP_HOLD_MS,
}: Props) {
  // Stable, collision-safe id for the plot clip-path (several charts can share a
  // page). Called unconditionally, before the early return, per the rules of hooks.
  const clipId = `somd-clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  // `cycle` counts entrance replays; 0 = not started (chart held blank while it
  // waits to scroll into view). Bumping it re-keys the paths/crests, which
  // remounts them and restarts their CSS animations.
  const [cycle, setCycle] = useState(animate && trigger === 'mount' ? 1 : 0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Tracked via ref (not state) so the loop timeout reads visibility without
  // re-running the effect on every scroll in/out.
  const inViewRef = useRef(trigger === 'mount')

  useEffect(() => {
    if (!animate || trigger !== 'in-view') return
    const el = rootRef.current
    // No element or no IntersectionObserver (SSR-adjacent runtimes, legacy
    // embeds): fail open and draw immediately rather than staying blank.
    if (!el || typeof IntersectionObserver === 'undefined') {
      inViewRef.current = true
      setCycle((c) => c || 1)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        inViewRef.current = entry.isIntersecting
        if (entry.isIntersecting) setCycle((c) => c + 1)
      },
      { threshold: IN_VIEW_THRESHOLD },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [animate, trigger])

  // Loop: after each cycle finishes (+ a hold on the final frame), start the
  // next one — but only while on screen. Off-screen the chain stops; the
  // in-view observer's re-entry bump restarts it.
  const laneCount = lanes.length
  useEffect(() => {
    if (!animate || !loop || cycle === 0) return
    // Negative/NaN config degrades to no rest rather than a broken timer.
    const hold = Number.isFinite(loopDelayMs) ? Math.max(0, loopDelayMs) : LOOP_HOLD_MS
    const cycleMs =
      DRAW_MS + Math.max(0, laneCount - 1) * STAGGER_MS + CREST_IN_MS + hold
    const t = window.setTimeout(() => {
      if (inViewRef.current) setCycle((c) => c + 1)
    }, cycleMs)
    return () => window.clearTimeout(t)
  }, [animate, loop, cycle, laneCount, loopDelayMs])

  if (lanes.length === 0) {
    return <div style={emptyStyle}>No matchday data</div>
  }

  // Three render phases: `playing` runs the entrance keyframes, `pending` holds
  // everything at the pre-draw frame (blank lines, hidden crests) until the
  // chart scrolls into view, and plain `animate=false` renders the final frame.
  const playing = animate && cycle > 0
  const pending = animate && cycle === 0

  const allPoints = lanes.flatMap((l) => l.points)
  const matchdays = allPoints.map((p) => p.matchday)
  // Resolve the x-axis window. The left origin defaults to the first matchday
  // actually present, so a trimmed series fills the plot rather than leaving a
  // blank gap back to MD1; `matchdayRange.from` overrides it. The right edge
  // prefers `matchdayRange.to`, then the legacy `totalMatchdays`, then the last
  // matchday in the data. `Math.max` keeps the axis from inverting under a
  // misconfigured range.
  const minMD = matchdayRange?.from ?? (matchdays.length ? Math.min(...matchdays) : 1)
  const maxMD = Math.max(
    minMD,
    matchdayRange?.to ?? totalMatchdays ?? (matchdays.length ? Math.max(...matchdays) : 1),
  )
  const maxPos = Math.max(1, ...allPoints.map((p) => p.position))

  // Three ticks across the window (first, mid, last), deduped so a narrow span
  // like MD37–MD38 doesn't emit colliding React keys / overlapping labels.
  const xTicks = Array.from(
    new Set([minMD, Math.round((minMD + maxMD) / 2), maxMD]),
  )

  const xScale = (md: number) =>
    PADDING.left +
    ((md - minMD) / Math.max(1, maxMD - minMD)) *
      (VIEW_W - PADDING.left - PADDING.right)
  // P1 maps to the top (PADDING.top); higher positions map downward — same as
  // f1-viz's PositionChart, so no inversion is needed.
  const yScale = (pos: number) =>
    PADDING.top +
    ((pos - 1) / Math.max(1, maxPos - 1)) * (VIEW_H - PADDING.top - PADDING.bottom)

  // When any lane is flagged `highlight`, emphasise it (full opacity, on top)
  // and dim the rest. With no highlight, everything renders normally — the
  // pre-existing behaviour, so the new fields stay fully backward compatible.
  const anyHighlight = lanes.some((l) => l.highlight)
  const laneOpacity = (lane: TeamLane) =>
    anyHighlight && !lane.highlight ? DIM_OPACITY : 1
  const laneWidth = (lane: TeamLane) =>
    lane.lineWidth ?? (lane.highlight ? HIGHLIGHT_WIDTH : BASE_WIDTH)

  // Paint dimmed lanes first so highlighted lanes (and their crests) sit on top.
  const ordered = anyHighlight
    ? [...lanes].sort(
        (a, b) => Number(Boolean(a.highlight)) - Number(Boolean(b.highlight)),
      )
    : lanes

  // Precompute geometry once (path `d` + endpoint) and drop empty lanes. The
  // flatMap + `last` guard keeps this sound even under noUncheckedIndexedAccess.
  const drawn = ordered.flatMap((lane) => {
    const pts = lane.points.slice().sort((a, b) => a.matchday - b.matchday)
    const last = pts[pts.length - 1]
    if (!last) return []
    const d = pts
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${xScale(p.matchday)} ${yScale(p.position)}`,
      )
      .join(' ')
    return [{ lane, d, endX: xScale(last.matchday), endY: yScale(last.position) }]
  })

  return (
    <div ref={rootRef} style={cardStyle}>
      {animate && <style>{KEYFRAMES}</style>}
      <div style={headerStyle}>
        <span style={titleStyle}>{title}</span>
        <span style={labelStyle}>{competitionLabel}</span>
      </div>
      <div style={plotWrapStyle}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          style={svgStyle}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`League position by matchday chart for ${competitionLabel}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={PADDING.left}
                y={PADDING.top}
                width={VIEW_W - PADDING.left - PADDING.right}
                height={VIEW_H - PADDING.top - PADDING.bottom}
              />
            </clipPath>
          </defs>
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
          {xTicks.map((md) => (
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
          {/* Lanes — clipped to the plot rect so an explicit `matchdayRange` narrower
              than the data doesn't spill lines over the axes. */}
          <g clipPath={matchdayRange ? `url(#${clipId})` : undefined}>
            {drawn.map(({ lane, d }, i) => {
              // `pending` keeps the dash fully offset with no animation, so the
              // lines sit invisible until the in-view bump re-keys them.
              const drawStyle: CSSProperties = playing
                ? {
                    strokeDasharray: '1',
                    strokeDashoffset: '1',
                    animation: `som-draw ${DRAW_MS}ms ease-out ${i * STAGGER_MS}ms forwards`,
                  }
                : pending
                  ? { strokeDasharray: '1', strokeDashoffset: '1' }
                  : {}
              return (
                <path
                  key={`${lane.team_id}-${cycle}`}
                  d={d}
                  pathLength={animate ? 1 : undefined}
                  fill="none"
                  stroke={lane.color}
                  strokeWidth={laneWidth(lane)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={laneOpacity(lane)}
                  style={drawStyle}
                />
              )
            })}
          </g>
        </svg>
        {/* Crest at each lane's latest point (HTML overlay so we can reuse the
            Crest fallback chain; positioned in % to track the svg viewBox). */}
        {drawn.map(({ lane, endX, endY }, i) => {
          // Pop the crest in just as its line finishes drawing.
          const crestDelay = Math.max(0, i * STAGGER_MS + DRAW_MS - 120)
          return (
            <div
              key={`${lane.team_id}-${cycle}`}
              style={{
                position: 'absolute',
                left: `${(endX / VIEW_W) * 100}%`,
                top: `${(endY / VIEW_H) * 100}%`,
                transform: 'translate(-50%, -50%)',
                opacity: laneOpacity(lane),
                zIndex: lane.highlight ? 2 : 1,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  background: 'var(--color-surface, #141d31)',
                  borderRadius: '999px',
                  padding: '2px',
                  lineHeight: 0,
                  boxShadow: lane.highlight
                    ? `0 0 0 2px ${lane.color}`
                    : '0 0 0 1px var(--color-line, #1f2a42)',
                  ...(playing
                    ? {
                        animation: `som-crest-in ${CREST_IN_MS}ms ease-out ${crestDelay}ms both`,
                      }
                    : pending
                      ? { opacity: 0 }
                      : null),
                }}
              >
                <Crest
                  team={lane.team_name}
                  crestUrl={lane.crest_url ?? undefined}
                  size={lane.highlight ? CREST_SIZE_HIGHLIGHT : CREST_SIZE}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div style={legendStyle}>
        {lanes.map((lane) => (
          <div
            key={lane.team_id}
            style={{ ...legendItemStyle, opacity: laneOpacity(lane) }}
          >
            <span
              style={{
                display: 'inline-block',
                height: '8px',
                width: '8px',
                borderRadius: '999px',
                backgroundColor: lane.color,
              }}
            />
            <span style={{ fontWeight: lane.highlight ? 700 : 400 }}>
              {lane.team_code ?? lane.team_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
