'use client'

import { DriverStandings } from '@vismay/f1-viz/web'
import type { ConstructorStandingRow } from '@vismay/f1-viz/types'
import { useDriverStandings, useConstructorStandings } from '@/lib/useStandings'

function Loading() {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl border border-border bg-surface">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
      Could not load: {message}
    </div>
  )
}

export function DriverStandingsWidget({ limit = 10 }: { limit?: number }) {
  const q = useDriverStandings()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox message={(q.error as Error).message} />
  const rows = (q.data ?? []).slice(0, limit)
  if (rows.length === 0) return <ErrorBox message="No standings yet" />
  return <DriverStandings rows={rows} />
}

function TeamMark({
  name,
  logoUrl,
  color,
}: {
  name: string
  logoUrl: string | null
  color: string | null
}) {
  const ring = color ?? 'var(--color-border)'
  if (logoUrl) {
    return (
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border p-0.5"
        style={{ borderColor: ring, backgroundColor: 'rgba(255,255,255,0.92)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="h-full w-full object-contain" />
      </span>
    )
  }
  const abbr = name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3) || '?'
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-semibold"
      style={{
        borderColor: ring,
        backgroundColor: color ? `${color}22` : 'var(--color-surface)',
        color: color ?? 'var(--color-text)',
      }}
    >
      {abbr}
    </span>
  )
}

function ConstructorTable({ rows }: { rows: ConstructorStandingRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_40px_40px] items-center gap-2 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Team</span>
        <span className="text-center">W</span>
        <span className="text-center">Pts</span>
      </div>
      {rows.map((r) => {
        // Same tint trick as DriverStandings — `${hex}1f` ≈ 12% alpha, low
        // enough to stay legible on the dark surface.
        const tint = r.primaryColor ? `${r.primaryColor}1f` : undefined
        return (
          <div
            key={r.constructorId}
            className="grid grid-cols-[28px_1fr_40px_40px] items-center gap-2 border-b border-border/50 px-3 py-2 text-xs last:border-b-0"
            style={tint ? { backgroundColor: tint } : undefined}
          >
            <span className="text-text">{r.position}</span>
            <span className="flex min-w-0 items-center gap-2">
              <TeamMark name={r.constructorName} logoUrl={r.logoUrl} color={r.primaryColor} />
              <span className="truncate text-text">{r.constructorName}</span>
            </span>
            <span className="text-center text-text">{r.wins}</span>
            <span className="text-center font-semibold text-text">{r.points}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ConstructorStandingsWidget({ limit = 10 }: { limit?: number }) {
  const q = useConstructorStandings()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox message={(q.error as Error).message} />
  const rows = (q.data ?? []).slice(0, limit)
  if (rows.length === 0) return <ErrorBox message="No standings yet" />
  return <ConstructorTable rows={rows} />
}
