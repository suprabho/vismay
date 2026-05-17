'use client'

import { useState } from 'react'
import type { RaceRow } from '@vismay/f1-viz/types'
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

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left disabled:cursor-default"
        disabled={!expandable}
      >
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
