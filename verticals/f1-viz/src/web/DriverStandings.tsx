'use client'

import Link from 'next/link'
import type { DriverStandingRow } from '../types'

type Props = { rows: DriverStandingRow[] }

function DriverHead({ name, code, headshotUrl, color }: {
  name: string
  code: string | null
  headshotUrl: string | null
  color: string | null
}) {
  const ring = color ?? 'var(--color-border)'
  if (headshotUrl) {
    return (
      <span
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border"
        style={{ borderColor: ring, backgroundColor: 'var(--color-surface)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={headshotUrl} alt={name} className="h-full w-full object-cover" />
      </span>
    )
  }
  const initials = code ?? name.split(' ').map((p) => p[0]).slice(0, 2).join('')
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold text-text"
      style={{ borderColor: ring, backgroundColor: 'var(--color-surface)' }}
    >
      {initials}
    </span>
  )
}

export function DriverStandings({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Driver</span>
        <span className="truncate">Team</span>
        <span className="text-center">W</span>
        <span className="text-center">Pts</span>
      </div>

      {rows.map((r) => {
        // `${hex}1f` is ~12% alpha — a subtle team-coloured tint behind each row
        // that stays legible on the dark surface.
        const tint = r.constructorColor ? `${r.constructorColor}1f` : undefined
        const inner = (
          <div
            className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-2 border-b border-border/50 px-3 py-2 text-xs last:border-b-0"
            style={tint ? { backgroundColor: tint } : undefined}
          >
            <span className="text-text">{r.position}</span>
            <span className="flex min-w-0 items-center gap-2">
              <DriverHead
                name={r.driverName}
                code={r.driverCode}
                headshotUrl={r.headshotUrl}
                color={r.constructorColor}
              />
              <span className="truncate text-text">{r.driverName}</span>
            </span>
            <span
              className="truncate text-muted"
              style={r.constructorColor ? { color: r.constructorColor } : undefined}
            >
              {r.constructorName}
            </span>
            <span className="text-center text-text">{r.wins}</span>
            <span className="text-center font-semibold text-text">{r.points}</span>
          </div>
        )
        return (
          <Link
            key={r.driverId}
            href={`/driver/${r.driverId}`}
            className="block hover:bg-bg/40"
          >
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
