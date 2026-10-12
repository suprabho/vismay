import { useId } from 'react'
import type { GameDetail } from '@/lib/espn'
import { gameLength, marginPath, periodStart, type Run } from '@/lib/margin'
import type { Team } from '@/lib/teams'

function pts(coords: Array<[number, number]>): string {
  return coords.map(([x, y]) => `${x},${y}`).join(' ')
}

function quarterLines(total: number, width: number, periods: number): number[] {
  const out: number[] = []
  for (let p = 2; p <= Math.max(4, periods); p++) out.push((periodStart(p) / total) * width)
  return out
}

/** "Q4 RUN · 8:30 → 1:30" */
export function runLabel(run: Run): string {
  const q = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`)
  const span = run.period === run.endPeriod ? q(run.period) : `${q(run.period)}–${q(run.endPeriod)}`
  return `${span} RUN · ${run.fromClock} → ${run.toClock}`
}

/**
 * Full-bleed score-margin chart from the winner's point of view: area above
 * zero in the winner's colour, below in the loser's, and the decisive run
 * drawn thick in the running team's colour. Used for the Feed hero and the
 * game page.
 */
export function MarginHero({
  detail,
  run,
  height = 300,
  labels = true,
}: {
  detail: GameDetail
  run: Run | null
  height?: number
  labels?: boolean
}) {
  const clipId = useId()
  const { game, margin } = detail
  const W = 366
  const H = height
  const PAD_X = 12
  const innerW = W - PAD_X * 2
  const winnerSide: 'home' | 'away' = (game.home.score ?? 0) >= (game.away.score ?? 0) ? 'home' : 'away'
  const loserSide = winnerSide === 'home' ? 'away' : 'home'
  const winner = game[winnerSide].team
  const loser = game[loserSide].team
  const total = gameLength(detail.periods)
  const TOP = labels ? 72 : 16
  const BOTTOM = 14
  const { coords } = marginPath(margin, {
    width: innerW,
    height: H - TOP - BOTTOM,
    total,
    perspective: winnerSide,
    pad: 4,
  })
  const shifted = coords.map(([x, y]): [number, number] => [x + PAD_X, y + TOP])
  const zeroY = (H - TOP - BOTTOM) / 2 + TOP
  const last = shifted[shifted.length - 1]
  const area = [[PAD_X, zeroY] as [number, number], ...shifted, [last[0], zeroY] as [number, number]]
  const runColor = run ? game[run.side].team.dot : winner.dot
  const runCoords = run ? shifted.slice(run.startIndex, run.endIndex + 1) : []
  // Deepest deficit the winner faced, labelled if it was a real comeback.
  let low = 0
  let lowIdx = -1
  margin.forEach((p, i) => {
    const m = winnerSide === 'home' ? p.home - p.away : p.away - p.home
    if (m < low) {
      low = m
      lowIdx = i
    }
  })

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <clipPath id={`${clipId}-up`}>
            <rect x="0" y="0" width={W} height={zeroY} />
          </clipPath>
          <clipPath id={`${clipId}-down`}>
            <rect x="0" y={zeroY} width={W} height={H - zeroY} />
          </clipPath>
        </defs>
        {quarterLines(total, innerW, detail.periods).map((x) => (
          <line key={x} x1={x + PAD_X} y1={TOP - 8} x2={x + PAD_X} y2={H - 6} stroke="var(--color-grid)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        <polygon points={pts(area)} fill={winner.dot} opacity={0.45} clipPath={`url(#${clipId}-up)`} />
        <polygon points={pts(area)} fill={loser.dot} opacity={0.4} clipPath={`url(#${clipId}-down)`} />
        <line x1={PAD_X} y1={zeroY} x2={W - PAD_X} y2={zeroY} stroke="var(--color-muted)" opacity={0.5} vectorEffect="non-scaling-stroke" />
        <polyline points={pts(shifted)} fill="none" stroke="var(--color-text)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {runCoords.length > 1 && (
          <polyline
            points={pts(runCoords)}
            fill="none"
            stroke={runColor}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {labels && (
        <>
          <div className="absolute top-4 left-4 font-mono text-[10px] tracking-[0.04em] text-muted">
            {winner.abbr} − {loser.abbr} · SCORE MARGIN
          </div>
          {run && (
            <div className="absolute top-[34px] right-[18px] text-right">
              <div
                className="text-[46px] leading-[0.9] font-extrabold tracking-[-0.02em] wdth-75 tabular-nums"
                style={{ color: runColor }}
              >
                {run.for}–{run.against}
              </div>
              <div className="mt-1 font-mono text-[10px] text-text">
                {game[run.side].team.abbr} {runLabel(run)}
              </div>
            </div>
          )}
          {lowIdx > 0 && low <= -5 && (
            <div
              className="absolute -translate-x-1/2 font-mono text-[10px] text-text"
              style={{ left: `${(shifted[lowIdx][0] / W) * 100}%`, top: `calc(${(shifted[lowIdx][1] / H) * 100}% + 8px)` }}
            >
              −{Math.abs(low)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Compact margin line for a live card or a thumbnail: regulation on the x
 * axis so a game in progress visibly stops part-way.
 */
export function MarginSpark({
  detail,
  perspective,
  color,
  height = 64,
  width = 334,
  quarters = true,
  className,
}: {
  detail: GameDetail
  perspective: 'home' | 'away'
  color: string
  height?: number
  width?: number
  quarters?: boolean
  className?: string
}) {
  const total = gameLength(detail.periods)
  const { coords } = marginPath(detail.margin, { width, height, total, perspective, pad: 4 })
  const last = coords[coords.length - 1]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className ?? 'block h-16 w-full'} aria-hidden="true">
      {quarters &&
        quarterLines(total, width, detail.periods).map((x) => (
          <line key={x} x1={x} y1={0} x2={x} y2={height} stroke="var(--color-grid)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ))}
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-slate-700)" vectorEffect="non-scaling-stroke" />
      <polyline points={pts(coords)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />}
    </svg>
  )
}

/** Margin from one team's side, as "OKC +7" / "level". */
export function marginText(detail: GameDetail, team: Team): string {
  const { game } = detail
  const mine = game.home.team.id === team.id ? game.home : game.away
  const theirs = mine === game.home ? game.away : game.home
  const d = (mine.score ?? 0) - (theirs.score ?? 0)
  if (d === 0) return 'Level'
  return d > 0 ? `${mine.team.abbr} +${d}` : `${theirs.team.abbr} +${-d}`
}
