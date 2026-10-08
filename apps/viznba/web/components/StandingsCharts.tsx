import type { StandingRow } from '@/lib/espn'

/** Point differential per team, sorted: the "Season Tracker" thumbnail. */
export function DiffBars({ rows, width = 200, height = 54, highlight }: { rows: StandingRow[]; width?: number; height?: number; highlight?: Set<string> }) {
  const sorted = [...rows].sort((a, b) => b.diff - a.diff)
  const peak = Math.max(1, ...sorted.map((r) => Math.abs(r.diff)))
  const bw = width / Math.max(1, sorted.length)
  const mid = height / 2
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true">
      <line x1="0" y1={mid} x2={width} y2={mid} stroke="#2a2f3d" strokeDasharray="2 3" />
      {sorted.map((r, i) => {
        const h = (Math.abs(r.diff) / peak) * (mid - 2)
        const fill = highlight?.has(r.team.id) ? r.team.dot : r.diff >= 0 ? 'var(--color-accent)' : '#5a6070'
        return (
          <rect
            key={r.team.id}
            x={i * bw + 0.6}
            y={r.diff >= 0 ? mid - h : mid}
            width={Math.max(1, bw - 1.2)}
            height={Math.max(1, h)}
            rx="1"
            fill={fill}
          />
        )
      })}
    </svg>
  )
}

/** Win totals for a conference's top eight: a mini standings board. */
export function WinsBars({ rows, width = 200, height = 54 }: { rows: StandingRow[]; width?: number; height?: number }) {
  const top = rows.slice(0, 8)
  const peak = Math.max(1, ...top.map((r) => r.wins))
  const bw = width / 8
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true">
      {top.map((r, i) => {
        const h = Math.max(2, (r.wins / peak) * (height - 2))
        return <rect key={r.team.id} x={i * bw + 2} y={height - h} width={bw - 4} height={h} rx="2" fill={i === 0 ? 'var(--color-accent)' : r.team.dot} opacity={i === 0 ? 1 : 0.55} />
      })}
    </svg>
  )
}
