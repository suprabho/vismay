'use client'

import Link from 'next/link'
import type { RaceRow as RaceRowData } from '../types'

type Props = { race: RaceRowData }

function dateLabel(iso: string, status: RaceRowData['status']): string {
  if (status === 'live') return 'LIVE'
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function statusBadge(status: RaceRowData['status']): string {
  if (status === 'live') return 'text-accent'
  if (status === 'finished') return 'text-muted'
  return 'text-text/80'
}

export function RaceRow({ race }: Props) {
  return (
    <Link
      href={`/race/${race.round}`}
      className="flex items-center border-b border-white/20 p-3 last:border-b-0 hover:bg-surface/40"
    >
      <div className="flex w-14 flex-col items-center">
        <span className={`text-sm font-semibold ${statusBadge(race.status)}`}>
          R{race.round}
        </span>
        <span className="mt-0.5 text-[10px] text-text/50">
          {dateLabel(race.date, race.status)}
        </span>
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <div className="truncate text-sm text-text">{race.raceName}</div>
        <div className="truncate text-[11px] text-muted">
          {race.circuitName}
          {race.locality ? ` · ${race.locality}` : ''}
          {race.hasSprint ? ' · Sprint' : ''}
        </div>
      </div>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="ml-2 h-4 w-4 text-muted"
      >
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}
