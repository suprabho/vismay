'use client'

import { useState } from 'react'
import { PositionChart } from '@vismay/f1-viz/web'
import type { RaceRow } from '@vismay/f1-viz/types'
import {
  useSessionResults,
  formatLapMs,
  formatGapMs,
  type SessionType,
} from '@/lib/useSessionResults'
import { useLapPositions } from '@/lib/useLapPositions'

type Tab = 'standings' | 'qualifying' | 'fp1' | 'fp2' | 'fp3' | 'sprintQ' | 'sprint'

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-text'
          : 'rounded-full px-3 py-1 text-[11px] font-medium text-muted hover:text-text'
      }
    >
      {children}
    </button>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center text-xs text-muted">
      {label}
    </div>
  )
}

/**
 * All session tables share the same Supabase source (ingestSessions). The only
 * difference between them is which columns make sense for the session type:
 *   race / sprint  — pos | driver+team-color | team | laps | best lap
 *   quali / sprintQ — pos | driver+team-color | team | best lap | gap
 *   fp1 / fp2 / fp3 — pos | driver+team-color | best lap | gap | laps
 */

const RACE_LIKE: SessionType[] = ['race', 'sprint']
const QUALI_LIKE: SessionType[] = ['quali', 'sprint_quali']

function DriverCell({
  code,
  name,
  color,
}: {
  code: string | null
  name: string
  color: string | null
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {code ? (
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
          style={{
            backgroundColor: color ? `${color}22` : 'var(--color-bg)',
            color: color ?? 'var(--color-text)',
          }}
        >
          {code}
        </span>
      ) : null}
      <span className="truncate text-text">{name}</span>
    </span>
  )
}

function SessionTable({
  round,
  type,
  emptyLabel,
}: {
  round: number
  type: SessionType
  emptyLabel: string
}) {
  const q = useSessionResults(round, type)
  if (q.isLoading) return <Empty label={`Loading ${emptyLabel}`} />
  if (q.error) return <Empty label={`No ${emptyLabel} yet`} />
  const rows = q.data ?? []
  if (rows.length === 0) return <Empty label={`No ${emptyLabel} yet`} />

  if (RACE_LIKE.includes(type)) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-[28px_1fr_70px_40px_56px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
          <span>#</span>
          <span>Driver</span>
          <span>Team</span>
          <span className="text-center">Laps</span>
          <span className="text-center">Best</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.driverId}
            className="grid grid-cols-[28px_1fr_70px_40px_56px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
          >
            <span className="text-text">{r.position ?? i + 1}</span>
            <DriverCell code={r.driverCode} name={r.driverName} color={r.constructorColor} />
            <span className="truncate text-muted">{r.constructorName ?? ''}</span>
            <span className="text-center text-text">{r.lapsCompleted ?? '—'}</span>
            <span className="text-center font-mono text-[11px] text-text/80">
              {formatLapMs(r.bestLapMs)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (QUALI_LIKE.includes(type)) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-[28px_1fr_70px_70px_56px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
          <span>#</span>
          <span>Driver</span>
          <span>Team</span>
          <span className="text-center">Best</span>
          <span className="text-center">Gap</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.driverId}
            className="grid grid-cols-[28px_1fr_70px_70px_56px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
          >
            <span className="text-text">{r.position ?? i + 1}</span>
            <DriverCell code={r.driverCode} name={r.driverName} color={r.constructorColor} />
            <span className="truncate text-muted">{r.constructorName ?? ''}</span>
            <span className="text-center font-mono text-[11px] text-text/80">
              {formatLapMs(r.bestLapMs)}
            </span>
            <span className="text-center font-mono text-[11px] text-muted">
              {formatGapMs(r.gapToLeaderMs)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Practice: pos | driver | best | gap | laps
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_70px_60px_40px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Driver</span>
        <span className="text-center">Best</span>
        <span className="text-center">Gap</span>
        <span className="text-center">Laps</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.driverId}
          className="grid grid-cols-[28px_1fr_70px_60px_40px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
        >
          <span className="text-text">{r.position ?? i + 1}</span>
          <DriverCell code={r.driverCode} name={r.driverName} color={r.constructorColor} />
          <span className="text-center font-mono text-[11px] text-text/80">
            {formatLapMs(r.bestLapMs)}
          </span>
          <span className="text-center font-mono text-[11px] text-muted">
            {formatGapMs(r.gapToLeaderMs)}
          </span>
          <span className="text-center text-muted">{r.lapsCompleted ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

function PositionByLap({ round, raceLabel, topN = 6 }: {
  round: number
  raceLabel: string
  topN?: number
}) {
  // Reuse useSessionResults to pick the top finishers, then feed their meta
  // into useLapPositions for the per-lap series.
  const results = useSessionResults(round, 'race')
  const driverMeta =
    (results.data ?? [])
      .slice(0, topN)
      .map((r) => ({
        driverId: r.driverId,
        driverCode: r.driverCode,
        driverName: r.driverName,
        constructorId: r.constructorId ?? 'unknown',
        constructorColor: r.constructorColor,
      }))
  const laps = useLapPositions(round, driverMeta)
  if (results.isLoading || laps.isLoading) return null
  const lanes = laps.data?.lanes ?? []
  if (lanes.length === 0) return null
  return (
    <PositionChart raceLabel={raceLabel} lanes={lanes} totalLaps={laps.data?.totalLaps} />
  )
}

export function RaceWeekendTabs({ race }: { race: RaceRow }) {
  const [tab, setTab] = useState<Tab>('standings')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        <TabButton active={tab === 'standings'} onClick={() => setTab('standings')}>
          Race
        </TabButton>
        <TabButton active={tab === 'qualifying'} onClick={() => setTab('qualifying')}>
          Qualifying
        </TabButton>
        <TabButton active={tab === 'fp1'} onClick={() => setTab('fp1')}>
          FP1
        </TabButton>
        <TabButton active={tab === 'fp2'} onClick={() => setTab('fp2')}>
          FP2
        </TabButton>
        {!race.hasSprint ? (
          <TabButton active={tab === 'fp3'} onClick={() => setTab('fp3')}>
            FP3
          </TabButton>
        ) : null}
        {race.hasSprint ? (
          <>
            <TabButton active={tab === 'sprintQ'} onClick={() => setTab('sprintQ')}>
              Sprint Q
            </TabButton>
            <TabButton active={tab === 'sprint'} onClick={() => setTab('sprint')}>
              Sprint
            </TabButton>
          </>
        ) : null}
      </div>

      {tab === 'standings' && (
        <div className="space-y-3">
          <PositionByLap round={race.round} raceLabel={`${race.season} ${race.raceName}`} />
          <SessionTable round={race.round} type="race" emptyLabel="results" />
        </div>
      )}
      {tab === 'qualifying' && <SessionTable round={race.round} type="quali" emptyLabel="qualifying" />}
      {tab === 'fp1' && <SessionTable round={race.round} type="fp1" emptyLabel="FP1 data" />}
      {tab === 'fp2' && <SessionTable round={race.round} type="fp2" emptyLabel="FP2 data" />}
      {tab === 'fp3' && <SessionTable round={race.round} type="fp3" emptyLabel="FP3 data" />}
      {tab === 'sprintQ' && <SessionTable round={race.round} type="sprint_quali" emptyLabel="sprint quali" />}
      {tab === 'sprint' && <SessionTable round={race.round} type="sprint" emptyLabel="sprint" />}
    </div>
  )
}
