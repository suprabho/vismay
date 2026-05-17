'use client'

import Link from 'next/link'
import type { DriverStandingRow } from '../types'

type Props = { rows: DriverStandingRow[] }

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
        const inner = (
          <div className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0">
            <span className="text-text">{r.position}</span>
            <span className="flex min-w-0 items-center gap-2">
              {r.driverCode ? (
                <span className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text/70">
                  {r.driverCode}
                </span>
              ) : null}
              <span className="truncate text-text">{r.driverName}</span>
            </span>
            <span className="truncate text-muted">{r.constructorName}</span>
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
