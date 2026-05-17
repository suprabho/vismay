'use client'

import Link from 'next/link'
import { useSchedule } from '@/lib/useSchedule'
import { RaceWeekendTabs } from '@/components/RaceWeekendTabs'

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
      </p>
      <div className="mt-6">
        <RaceWeekendTabs race={race} />
      </div>
    </main>
  )
}
