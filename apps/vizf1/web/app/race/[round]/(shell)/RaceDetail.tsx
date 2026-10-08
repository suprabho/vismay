'use client'

import Link from 'next/link'
import { FilmStrip } from '@phosphor-icons/react'
import { useSchedule } from '@/lib/useSchedule'
import { RaceWeekendTabs } from '@/components/RaceWeekendTabs'
import { CircuitMap } from '@/components/CircuitMap'

export default function RaceDetail({ round }: { round: number }) {
  const q = useSchedule()
  const race = (q.data ?? []).find((r) => r.round === round)

  if (q.isLoading)
    return (
      <main className="mx-auto flex max-w-2xl items-center justify-center px-4 py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    )

  if (!race)
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-sm text-muted">
        Round {round} not found.{' '}
        <Link href="/schedule" className="text-accent hover:underline">
          Back to schedule
        </Link>
      </main>
    )

  return (
    <main className="mx-auto max-w-2xl px-4 py-4 pb-12">
      <Link href="/schedule" className="text-xs text-muted hover:text-text">
        ← All races
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-text">{race.raceName}</h1>
      <p className="text-xs text-muted">
        Round {race.round} · {race.circuitName}
        {race.locality ? ` · ${race.locality}` : ''}
        {race.hasSprint ? ' · Sprint' : ''}
      </p>
      {race.circuitId ? (
        <div className="mt-4">
          <CircuitMap circuitId={race.circuitId} />
        </div>
      ) : null}
      {race.status === 'canceled' ? (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-center text-xs text-muted">
          This Grand Prix was canceled — no session data is available.
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href={`/race/${round}/replay`}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-2.5 text-xs font-medium text-text transition-colors hover:border-accent"
            >
              <span className="text-accent">▶</span> Race Replay
            </Link>
            <Link
              href={`/race/${round}/recap`}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-2.5 text-xs font-medium text-text transition-colors hover:border-accent"
            >
              <FilmStrip size={14} weight="bold" className="text-accent" aria-hidden /> Race Recap
            </Link>
          </div>
          <div className="mt-6">
            <RaceWeekendTabs race={race} />
          </div>
        </>
      )}
    </main>
  )
}
