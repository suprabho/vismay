'use client'

import { PositionChart } from '@vismay/f1-viz/web'
import { useSchedule } from '@/lib/useSchedule'
import { useRaceResults } from '@/lib/useRaceResults'
import { useLapPositions } from '@/lib/useLapPositions'

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface">
      <div className="flex flex-col items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-xs text-muted">{label}</span>
      </div>
    </div>
  )
}

/**
 * Most recently-finished race in the current season, charted as
 * position-by-lap for the leading drivers.
 *
 * Uses three hooks in sequence:
 *   1. schedule — pick the latest race with `status === 'finished'`
 *   2. raceResults — drives both driver metadata and the lane filter (top 8)
 *   3. lapPositions — pivot the /laps payload into per-driver series
 */
export function LatestRaceChart({ topN = 6 }: { topN?: number }) {
  const schedule = useSchedule()
  const finished = (schedule.data ?? []).filter((r) => r.status === 'finished')
  const latest = finished[finished.length - 1] ?? null

  const results = useRaceResults(latest?.round ?? null)

  const driverMeta =
    (results.data ?? [])
      .slice(0, topN)
      .map((r) => ({
        driverId: r.driverId,
        driverCode: r.driverCode,
        driverName: r.driverName,
        constructorId: r.constructorId,
      }))

  const laps = useLapPositions(latest?.round ?? null, driverMeta)

  if (schedule.isLoading) return <Loading label="Loading schedule" />
  if (!latest)
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        No finished races in the current season yet.
      </div>
    )
  if (results.isLoading || laps.isLoading) return <Loading label="Loading lap data" />

  const lanes = laps.data?.lanes ?? []
  return (
    <PositionChart
      raceLabel={`${latest.season} ${latest.raceName}`}
      lanes={lanes}
      totalLaps={laps.data?.totalLaps}
    />
  )
}
