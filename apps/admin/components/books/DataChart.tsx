'use client'

import { useMemo } from 'react'
import { goalsByMonth, leagueMatches, monthEnd, pointsRace, resultsStrip, standings, topTeams, type MatchRow } from '@/lib/seasonBooks/matches'
import { chapterLabel, LEAGUE_COMPETITIONS, type DataBinding } from '@/lib/seasonBooks/plan'
import { PALETTE, RESULT_COLOURS } from '@/lib/seasonBooks/system'
import { useMatches } from './MatchData'

const W = 300
const H = 180
const FONT = 'ui-sans-serif, system-ui, sans-serif'

/**
 * A spread's chart drawn from the real match data, in the series chart style
 * (system.ts CHART_STYLE): two highlight colours at most, direct labels, one
 * baseline. `compact` drops the labels for thumbnails.
 */
export function DataChart({ binding, compact = false, className }: { binding: DataBinding; compact?: boolean; className?: string }) {
  const entry = useMatches(binding.competition || null)
  if (!binding.competition) return <ChartMessage className={className} text="Pick a competition" />
  if (!entry || entry.status === 'loading') return <ChartMessage className={className} text="Loading matches…" />
  if (entry.status === 'error') return <ChartMessage className={className} text={compact ? 'No data' : entry.error} />
  if (!entry.matches.length) return <ChartMessage className={className} text="No matches for this season" />
  return <DataChartBody binding={binding} matches={entry.matches} compact={compact} className={className} />
}

function ChartMessage({ text, className }: { text: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="xMidYMid meet">
      <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} fill={PALETTE.muted} fontFamily={FONT}>{text}</text>
    </svg>
  )
}

function DataChartBody({ binding, matches, compact, className }: { binding: DataBinding; matches: MatchRow[]; compact: boolean; className?: string }) {
  const content = useMemo(() => {
    const league = LEAGUE_COMPETITIONS.has(binding.competition) ? leagueMatches(matches) : matches
    switch (binding.preset) {
      case 'points-race': return <PointsRace matches={league} teams={binding.teams.length ? binding.teams : topTeams(league)} compact={compact} />
      case 'month-table': return <MonthTable matches={league} month={binding.month} compact={compact} />
      case 'results-strip': return <Strip matches={matches} team={binding.teams[0]} month={binding.month} compact={compact} />
      case 'goals-by-month': return <GoalsByMonth matches={matches} month={binding.month} compact={compact} />
    }
  }, [binding, matches, compact])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="xMidYMid meet" fontFamily={FONT}>
      {content}
    </svg>
  )
}

const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000

function PointsRace({ matches, teams, compact }: { matches: MatchRow[]; teams: string[]; compact: boolean }) {
  const race = pointsRace(matches, teams)
  const all = race.flatMap(r => r.points)
  if (!all.length) return <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} fill={PALETTE.muted}>Pick teams in this competition</text>
  const x0 = day(matches[0].d)
  const x1 = day(matches[matches.length - 1].d)
  const maxPts = Math.max(...all.map(p => p.pts), 1)
  const left = 8
  const right = compact ? 292 : 228
  const top = 10
  const bottom = 166
  const sx = (d: string) => left + ((day(d) - x0) / Math.max(1, x1 - x0)) * (right - left)
  const sy = (pts: number) => bottom - (pts / maxPts) * (bottom - top)
  const colour = (i: number) => i === 0 ? PALETTE.accent : i === 1 ? PALETTE.second : PALETTE.muted
  // Context lines first so the highlights sit on top.
  const order = race.map((r, i) => ({ r, i })).reverse()
  // Direct labels at the line ends, nudged apart so close finishes stay readable.
  const labelY = new Map<string, number>()
  const ends = race.filter(r => r.points.length).map(r => ({ team: r.team, y: sy(r.points[r.points.length - 1].pts) + 3 })).sort((a, b) => a.y - b.y)
  ends.forEach((e, k) => labelY.set(e.team, k ? Math.max(e.y, labelY.get(ends[k - 1].team)! + 11) : e.y))
  return <>
    <line x1={left} y1={bottom} x2={right} y2={bottom} stroke={PALETTE.ink} strokeWidth={0.75} />
    {order.map(({ r, i }) => (
      <g key={r.team}>
        <polyline fill="none" stroke={colour(i)} strokeWidth={i < 2 ? 2 : 1} strokeLinejoin="round"
          points={[`${left},${bottom}`, ...r.points.map(p => `${sx(p.d).toFixed(1)},${sy(p.pts).toFixed(1)}`)].join(' ')} />
        {r.points.length > 0 && (() => {
          const last = r.points[r.points.length - 1]
          return <>
            <circle cx={sx(last.d)} cy={sy(last.pts)} r={compact ? 1.8 : 2.2} fill={colour(i)} />
            {!compact && <text x={sx(last.d) + 5} y={labelY.get(r.team)} fontSize={8} fill={i < 2 ? colour(i) : PALETTE.muted} fontWeight={i < 2 ? 600 : 400}>
              {r.team.length > 16 ? `${r.team.slice(0, 15)}…` : r.team} {last.pts}
            </text>}
          </>
        })()}
      </g>
    ))}
    {!compact && <text x={left} y={bottom + 11} fontSize={6.5} fill={PALETTE.muted} letterSpacing="0.06em">CUMULATIVE POINTS, {matches[0].d.slice(0, 7)} → {matches[matches.length - 1].d.slice(0, 7)}</text>}
  </>
}

function MonthTable({ matches, month, compact }: { matches: MatchRow[]; month: string | null; compact: boolean }) {
  const table = standings(matches, month ? monthEnd(month) : undefined)
  const rows = table.slice(0, compact ? 10 : 20)
  const rowH = Math.min(14, (H - 22) / Math.max(rows.length, 1))
  const font = Math.min(8, rowH * 0.7)
  return <>
    {!compact && <>
      <text x={8} y={10} fontSize={6.5} fill={PALETTE.muted} letterSpacing="0.06em">{month ? `TABLE AT THE END OF ${chapterLabel(month).toUpperCase()}` : 'FINAL TABLE'}</text>
      {['P', 'GD', 'Pts'].map((h, i) => <text key={h} x={210 + i * 34} y={10} fontSize={6.5} fill={PALETTE.muted} textAnchor="end">{h}</text>)}
    </>}
    {rows.map((r, i) => {
      const y = 16 + i * rowH
      const hi = i === 0
      return <g key={r.team}>
        {i > 0 && <line x1={8} y1={y} x2={W - 8} y2={y} stroke={PALETTE.rule} strokeWidth={0.25} />}
        <text x={18} y={y + rowH * 0.72} fontSize={font} fill={PALETTE.muted} textAnchor="end">{i + 1}</text>
        <text x={26} y={y + rowH * 0.72} fontSize={font} fill={hi ? PALETTE.accent : PALETTE.ink} fontWeight={hi ? 700 : 400}>{r.team}</text>
        {(compact ? [r.pts] : [r.p, r.gd, r.pts]).map((v, c, arr) => (
          <text key={c} x={compact ? W - 10 : 210 + c * 34} y={y + rowH * 0.72} fontSize={font} textAnchor="end"
            fill={c === arr.length - 1 ? PALETTE.ink : PALETTE.muted} fontWeight={c === arr.length - 1 ? 700 : 400}>{c === 1 && !compact && v > 0 ? `+${v}` : v}</text>
        ))}
      </g>
    })}
  </>
}

function Strip({ matches, team, month, compact }: { matches: MatchRow[]; team: string | undefined; month: string | null; compact: boolean }) {
  if (!team) return <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} fill={PALETTE.muted}>Pick a team</text>
  const games = resultsStrip(matches, team)
  if (!games.length) return <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} fill={PALETTE.muted}>No games for {team}</text>
  const cell = Math.min(14, (W - 16) / games.length)
  const size = Math.max(2, cell - 1.5)
  const line = 95
  const bar = 34
  const counts = { W: 0, D: 0, L: 0 }
  for (const g of games) counts[g.r]++
  return <>
    {!compact && <text x={8} y={20} fontSize={9} fontWeight={700} fill={PALETTE.ink}>{team}</text>}
    {!compact && <text x={8} y={32} fontSize={6.5} fill={PALETTE.muted} letterSpacing="0.06em">W {counts.W} · D {counts.D} · L {counts.L}</text>}
    {games.map((g, i) => {
      const off = month && g.d.slice(0, 7) !== month
      const [y, h] = g.r === 'W' ? [line - bar, bar] : g.r === 'L' ? [line, bar] : [line - 3, 6]
      return (
        <rect key={i} x={8 + i * cell} y={y} width={size} height={h} fill={RESULT_COLOURS[g.r]} opacity={off ? 0.25 : 1}>
          <title>{`${g.d} ${g.home ? 'v' : '@'} ${g.opponent} ${g.gf}–${g.ga}`}</title>
        </rect>
      )
    })}
    <line x1={8} y1={line} x2={8 + games.length * cell} y2={line} stroke={PALETTE.ink} strokeWidth={0.5} />
    {!compact && <text x={8} y={line + bar + 16} fontSize={6.5} fill={PALETTE.muted} letterSpacing="0.06em">EVERY GAME IN ORDER · WIN UP, LOSS DOWN, DRAW ON THE LINE</text>}
  </>
}

function GoalsByMonth({ matches, month, compact }: { matches: MatchRow[]; month: string | null; compact: boolean }) {
  const months = goalsByMonth(matches)
  const max = Math.max(...months.map(m => m.perGame), 1)
  const bw = (W - 16) / Math.max(months.length, 1)
  const bottom = compact ? 172 : 160
  return <>
    {months.map((m, i) => {
      const h = (m.perGame / max) * (bottom - 24)
      const hi = month ? m.month === month : i === months.reduce((b, x, j) => x.perGame > months[b].perGame ? j : b, 0)
      return <g key={m.month}>
        <rect x={8 + i * bw + 2} y={bottom - h} width={bw - 4} height={h} fill={hi ? PALETTE.accent : PALETTE.muted} />
        {!compact && <>
          <text x={8 + i * bw + bw / 2} y={bottom - h - 3} fontSize={7} textAnchor="middle" fill={hi ? PALETTE.accent : PALETTE.ink}>{m.perGame.toFixed(2)}</text>
          <text x={8 + i * bw + bw / 2} y={bottom + 9} fontSize={6.5} textAnchor="middle" fill={PALETTE.muted}>{chapterLabel(m.month, true).slice(0, 3)}</text>
        </>}
      </g>
    })}
    <line x1={8} y1={bottom} x2={W - 8} y2={bottom} stroke={PALETTE.ink} strokeWidth={0.75} />
    {!compact && <text x={8} y={12} fontSize={6.5} fill={PALETTE.muted} letterSpacing="0.06em">GOALS PER GAME, BY MONTH</text>}
  </>
}
