'use client'

import { PositionChart } from '@vismay/f1-viz/web'
import { useStandingsOverTime } from '@/lib/useStandingsOverTime'

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
 * Drivers' championship position after each completed race-day this season.
 * Reuses PositionChart — x-axis is race round instead of lap.
 */
export function SeasonStandingsChart({ topN = 6 }: { topN?: number }) {
  const q = useStandingsOverTime(topN)
  if (q.isLoading) return <Loading label="Loading standings" />
  const lanes = q.data?.lanes ?? []
  const rounds = q.data?.rounds ?? []
  if (lanes.length === 0)
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        No finished races in the current season yet.
      </div>
    )
  const totalRounds = rounds[rounds.length - 1] ?? lanes[0]?.points.at(-1)?.lap ?? 1
  const year = new Date().getFullYear()
  return (
    <PositionChart
      title="Standings by round"
      raceLabel={`${year} season`}
      lanes={lanes}
      totalLaps={totalRounds}
      xTickFormat={(n) => `R${n}`}
    />
  )
}
