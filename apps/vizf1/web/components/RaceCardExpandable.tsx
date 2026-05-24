'use client'

import { useState } from 'react'
import type { RaceRow } from '@vismay/f1-viz/types'
import { findGrandPrix, flagUrl } from '@vismay/f1-viz/grands-prix'
import { RaceWeekendTabs } from '@/components/RaceWeekendTabs'

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
        <div className="border-t border-border/50 p-3">
          <RaceWeekendTabs race={race} />
        </div>
      ) : null}
    </div>
  )
}
