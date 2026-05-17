'use client'

import { useSchedule } from '@/lib/useSchedule'
import { RaceCardExpandable } from '@/components/RaceCardExpandable'

export function ScheduleList() {
  const q = useSchedule()
  if (q.isLoading)
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  if (q.error)
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Could not load schedule: {(q.error as Error).message}
      </div>
    )

  const races = q.data ?? []
  return (
    <div className="space-y-2">
      {races.map((r) => (
        <RaceCardExpandable key={r.id} race={r} />
      ))}
    </div>
  )
}
