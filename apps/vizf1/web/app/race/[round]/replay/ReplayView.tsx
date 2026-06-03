'use client'

import Link from 'next/link'
import { useSchedule } from '@/lib/useSchedule'
import { RaceReplay } from '@/components/replay/RaceReplay'

export default function ReplayView({ round }: { round: number }) {
  const q = useSchedule()
  const race = (q.data ?? []).find((r) => r.round === round)

  return (
    <main className="mx-auto max-w-5xl px-4 py-4 pb-12">
      <Link href={`/race/${round}`} className="text-xs text-muted hover:text-text">
        ← {race ? race.raceName : `Round ${round}`}
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Race Replay</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted">
          Sample telemetry
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Scrub the timeline, toggle cars, and focus a driver. Live positions recompute as the race plays.
      </p>

      <div className="mt-5">
        <RaceReplay sessionRef={String(round)} />
      </div>
    </main>
  )
}
