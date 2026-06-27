'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { RaceRow } from '@vismay/f1-viz/types'
import { findGrandPrix, flagUrl } from '@vismay/f1-viz/grands-prix'
import { useSessionResults, formatLapMs } from '@/lib/useSessionResults'

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function statusPill(status: RaceRow['status']) {
  if (status === 'live')
    return <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">Live</span>
  if (status === 'finished')
    return <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">Result</span>
  return <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">Upcoming</span>
}

export function RaceCardExpandable({ race }: { race: RaceRow }) {
  const [open, setOpen] = useState(false)
  const expandable = race.status === 'finished' || race.status === 'live'
  // Bundled palette knows the country flag + accent for each GP — fall back
  // gracefully if a race name isn't in the registry (new venues, sprint-only
  // rounds, etc.) so the row keeps rendering without country chrome.
  const gp = findGrandPrix(race.raceName)
  // 160-wide source for a ~40px-wide thumbnail = ~4x density, stays crisp on
  // retina without bumping payload meaningfully (one PNG per row).
  const flag = gp ? flagUrl(gp.code, 160) : null
  const accent = gp?.accent ?? null

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface border-l-2"
      style={
        accent
          ? {
              borderLeftColor: accent,
              // 12% accent blended into the surface keeps bright country
              // colors (Belgium yellow, F1 red, China red) subtle on the
              // dark theme while still reading as a country-themed row.
              background: `color-mix(in srgb, var(--color-surface) 88%, ${accent} 12%)`,
            }
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left disabled:cursor-default"
        disabled={!expandable}
      >
        {flag ? (
          // flagcdn.com isn't allowlisted for next/image; plain <img> keeps
          // the row light and matches the race-card layout's flag treatment.
          // Sized to roughly match the round/date stack height so it reads as
          // the row's primary country identifier.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flag}
            alt=""
            width={40}
            height={27}
            className="h-[27px] w-10 flex-none rounded-sm object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          />
        ) : null}
        <div className="flex w-14 flex-col items-center">
          <span className="text-sm font-semibold text-text">R{race.round}</span>
          <span className="mt-0.5 text-[10px] text-muted">{dateLabel(race.date)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm text-text">{race.raceName}</div>
          <div className="truncate text-[11px] text-muted">
            {race.circuitName}
            {race.locality ? ` · ${race.locality}` : ''}
            {race.hasSprint ? ' · Sprint' : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusPill(race.status)}
          {expandable ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </div>
      </button>
      {open && expandable ? (
        <div className="space-y-2 border-t border-border/50 p-3">
          <Top10 round={race.round} />
          <Link
            href={`/race/${race.round}`}
            className="block rounded-lg border border-border bg-surface py-2 text-center text-xs font-medium text-text transition-colors hover:border-accent"
          >
            View race details →
          </Link>
        </div>
      ) : null}
    </div>
  )
}

/** Compact top-10 race classification for the schedule card — the full results
 *  (every finisher, qualifying/practice, telemetry) live on the race details page. */
function Top10({ round }: { round: number }) {
  const q = useSessionResults(round, 'race')
  if (q.isLoading)
    return <div className="rounded-lg border border-border bg-bg p-3 text-center text-xs text-muted">Loading results…</div>
  const rows = (q.data ?? []).slice(0, 10)
  if (rows.length === 0)
    return <div className="rounded-lg border border-border bg-bg p-3 text-center text-xs text-muted">No results yet</div>
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg">
      {rows.map((r, i) => (
        <div
          key={r.driverId}
          className="grid grid-cols-[22px_1fr_auto] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-xs last:border-b-0"
        >
          <span className="text-muted">{r.position ?? i + 1}</span>
          <span className="flex min-w-0 items-center gap-2">
            {r.driverCode ? (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  backgroundColor: r.constructorColor ? `${r.constructorColor}22` : 'var(--color-bg)',
                  color: r.constructorColor ?? 'var(--color-text)',
                }}
              >
                {r.driverCode}
              </span>
            ) : null}
            <span className="truncate text-text">{r.driverName}</span>
          </span>
          <span className="font-mono text-[11px] text-text/70">{formatLapMs(r.bestLapMs)}</span>
        </div>
      ))}
    </div>
  )
}
