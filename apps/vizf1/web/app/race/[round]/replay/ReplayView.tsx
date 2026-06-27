'use client'

import Link from 'next/link'
import { useSchedule } from '@/lib/useSchedule'
import { useTelemetrySession } from '@/lib/useTelemetrySession'
import { RaceReplay } from '@/components/replay/RaceReplay'

export default function ReplayView({ round }: { round: number }) {
  const q = useSchedule()
  const race = (q.data ?? []).find((r) => r.round === round)
  // FastF1 telemetry and the OpenF1 schedule number rounds differently, so the
  // URL round can't look up the session — using it pulls a DIFFERENT race's
  // telemetry (or 404s). Resolve the real session_key by GP NAME and hand that
  // to the replay (a session_key resolves directly, bypassing the round filter).
  const telem = useTelemetrySession(race?.raceName ?? null)
  const supabaseSource = process.env.NEXT_PUBLIC_VIZF1_REPLAY_SOURCE === 'supabase'
  const sessionKey = telem.data?.sessionKey ?? null
  // "Live" only when real telemetry actually resolved for this race (fixes the
  // prior mislabel where the badge keyed purely off the env flag).
  const live = supabaseSource && !!sessionKey
  // Wait for the schedule + telemetry lookup so we never flash the wrong session.
  const resolving = q.isLoading || (!!race && telem.isLoading)
  // With the Supabase source on, only render the replay when a real session
  // resolved — otherwise the bare round would collide with another race's
  // telemetry. (Source off ⇒ RaceReplay uses the bundled demo regardless.)
  const showReplay = !supabaseSource || !!sessionKey

  return (
    <main className="mx-auto max-w-5xl px-4 py-4 pb-12">
      <Link href={`/race/${round}`} className="text-xs text-muted hover:text-text">
        ← {race ? race.raceName : `Round ${round}`}
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Race Replay</h1>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted">
          {live ? 'Live telemetry' : 'Sample telemetry'}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Scrub the timeline, toggle cars, and focus a driver. Live positions recompute as the race plays.
      </p>

      <div className="mt-5">
        {resolving ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : showReplay ? (
          <RaceReplay sessionRef={sessionKey ?? String(round)} />
        ) : (
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
            Telemetry isn&rsquo;t available for this race yet.
          </div>
        )}
      </div>
    </main>
  )
}
