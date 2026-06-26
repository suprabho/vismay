'use client'

import Link from 'next/link'
import type { QualifyingRow } from '../types'

type Props = { rows: QualifyingRow[]; sessionLabel?: string }

function fmt(t: string | null): string {
  return t && t.trim() ? t : '—'
}

export function QualifyingResults({ rows, sessionLabel }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {sessionLabel ? (
        <div className="border-b border-border bg-bg px-3 py-2 text-[10px] uppercase tracking-wide text-muted">
          {sessionLabel}
        </div>
      ) : null}
      <div className="grid grid-cols-[28px_1fr_56px_56px_56px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Driver</span>
        <span className="text-center">Q1</span>
        <span className="text-center">Q2</span>
        <span className="text-center">Q3</span>
      </div>

      {rows.map((r) => {
        const color = r.constructorColor ?? null
        const tint = color ? `${color}1f` : undefined
        const chip = r.driverCode ?? r.driverName.split(' ').map((p) => p[0]).slice(0, 2).join('')
        const inner = (
          <div
            className="grid grid-cols-[28px_1fr_56px_56px_56px] items-center gap-2 border-b border-border/50 px-3 py-2 text-xs last:border-b-0"
            style={tint ? { backgroundColor: tint } : undefined}
          >
            <span className="text-text">{r.position}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="inline-flex h-7 w-9 shrink-0 items-center justify-center rounded border font-mono text-[10px] font-semibold text-text"
                style={{ borderColor: color ?? 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
              >
                {chip}
              </span>
              <span className="truncate text-text">{r.driverName}</span>
            </span>
            <span className="text-center font-mono text-muted">{fmt(r.q1)}</span>
            <span className="text-center font-mono text-muted">{fmt(r.q2)}</span>
            <span className="text-center font-mono font-semibold text-text">{fmt(r.q3)}</span>
          </div>
        )
        return (
          <Link key={r.driverId} href={`/driver/${r.driverId}`} className="block hover:bg-bg/40">
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
