'use client'

import Link from 'next/link'
import type { ConstructorStandingRow } from '../types'

type Props = { rows: ConstructorStandingRow[] }

function TeamMark({ name, logoUrl, color }: {
  name: string
  logoUrl: string | null
  color: string | null
}) {
  const ring = color ?? 'var(--color-border)'
  if (logoUrl) {
    return (
      <span
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border"
        style={{ borderColor: ring, backgroundColor: 'var(--color-surface)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="h-full w-full object-contain p-1" />
      </span>
    )
  }
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold text-text"
      style={{ borderColor: ring, backgroundColor: color ? `${color}1f` : 'var(--color-surface)' }}
    >
      {initials}
    </span>
  )
}

export function ConstructorStandings({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Team</span>
        <span className="truncate">Nat.</span>
        <span className="text-center">W</span>
        <span className="text-center">Pts</span>
      </div>

      {rows.map((r) => {
        const tint = r.primaryColor ? `${r.primaryColor}1f` : undefined
        const inner = (
          <div
            className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-2 border-b border-border/50 px-3 py-2 text-xs last:border-b-0"
            style={tint ? { backgroundColor: tint } : undefined}
          >
            <span className="text-text">{r.position}</span>
            <span className="flex min-w-0 items-center gap-2">
              <TeamMark name={r.constructorName} logoUrl={r.logoUrl} color={r.primaryColor} />
              <span
                className="truncate text-text"
                style={r.primaryColor ? { color: r.primaryColor } : undefined}
              >
                {r.constructorName}
              </span>
            </span>
            <span className="truncate text-muted">{r.nationality ?? '—'}</span>
            <span className="text-center text-text">{r.wins}</span>
            <span className="text-center font-semibold text-text">{r.points}</span>
          </div>
        )
        return (
          <Link
            key={r.constructorId}
            href={`/team/${r.constructorId}`}
            className="block hover:bg-bg/40"
          >
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
