'use client'

import { useState } from 'react'
import type { RaceRow } from '@vismay/f1-viz/types'
import { useRaceResults } from '@/lib/useRaceResults'
import { useQualifying } from '@/lib/useQualifying'
import {
  useSessionResults,
  formatLapMs,
  formatGapMs,
  type SessionType,
} from '@/lib/useSessionResults'

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

function ResultsTable({ round }: { round: number }) {
  const q = useRaceResults(round)
  if (q.isLoading) return <Empty label="Loading results" />
  if (q.error) return <Empty label="No results yet" />
  const rows = q.data ?? []
  if (rows.length === 0) return <Empty label="No results yet" />
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-center">Laps</span>
        <span className="text-center">Pts</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.driverId}
          className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
        >
          <span className="text-text">{r.position}</span>
          <span className="flex min-w-0 items-center gap-2">
            {r.driverCode ? (
              <span className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text/70">
                {r.driverCode}
              </span>
            ) : null}
            <span className="truncate text-text">{r.driverName}</span>
          </span>
          <span className="truncate text-muted">{r.constructorName}</span>
          <span className="text-center text-text">{r.laps}</span>
          <span className="text-center font-semibold text-text">{r.points}</span>
        </div>
      ))}
    </div>
  )
}

function QualifyingTable({ round }: { round: number }) {
  const q = useQualifying(round)
  if (q.isLoading) return <Empty label="Loading qualifying" />
  if (q.error) return <Empty label="No qualifying yet" />
  const rows = q.data ?? []
  if (rows.length === 0) return <Empty label="No qualifying yet" />
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_64px_64px_64px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Driver</span>
        <span className="text-center">Q1</span>
        <span className="text-center">Q2</span>
        <span className="text-center">Q3</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.driverId}
          className="grid grid-cols-[28px_1fr_64px_64px_64px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
        >
          <span className="text-text">{r.position}</span>
          <span className="flex min-w-0 items-center gap-2">
            {r.driverCode ? (
              <span className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text/70">
                {r.driverCode}
              </span>
            ) : null}
            <span className="truncate text-text">{r.driverName}</span>
          </span>
          <span className="text-center font-mono text-[11px] text-text/80">{r.q1 ?? '—'}</span>
          <span className="text-center font-mono text-[11px] text-text/80">{r.q2 ?? '—'}</span>
          <span className="text-center font-mono text-[11px] text-text/80">{r.q3 ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Practice & Sprint tables fetch from Supabase (populated by ingestSessions).
 * Practice + sprint qualifying show best lap + gap; Sprint shows position + points.
 */
function PracticeTable({ round, type }: { round: number; type: SessionType }) {
  const q = useSessionResults(round, type)
  if (q.isLoading) return <Empty label="Loading session" />
  if (q.error) return <Empty label="Session unavailable" />
  const rows = q.data ?? []
  if (rows.length === 0) return <Empty label="Not yet ingested" />
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
          <span className="flex min-w-0 items-center gap-2">
            {r.driverCode ? (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  backgroundColor: r.constructorColor ? `${r.constructorColor}22` : 'var(--color-bg)',
                  color: r.constructorColor ?? 'var(--color-text)',
                }}
              >
                {r.driverCode}
              </span>
            ) : null}
            <span className="truncate text-text">{r.driverName}</span>
          </span>
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

function SprintTable({ round }: { round: number }) {
  const q = useSessionResults(round, 'sprint')
  if (q.isLoading) return <Empty label="Loading sprint" />
  if (q.error) return <Empty label="Sprint unavailable" />
  const rows = q.data ?? []
  if (rows.length === 0) return <Empty label="Not yet ingested" />
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Driver</span>
        <span>Team</span>
        <span className="text-center">Laps</span>
        <span className="text-center">Pts</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.driverId}
          className="grid grid-cols-[28px_1fr_60px_40px_40px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
        >
          <span className="text-text">{r.position ?? i + 1}</span>
          <span className="flex min-w-0 items-center gap-2">
            {r.driverCode ? (
              <span className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text/70">
                {r.driverCode}
              </span>
            ) : null}
            <span className="truncate text-text">{r.driverName}</span>
          </span>
          <span className="truncate text-muted">{r.constructorName ?? ''}</span>
          <span className="text-center text-text">{r.lapsCompleted ?? '—'}</span>
          <span className="text-center font-semibold text-text">{r.points ?? '—'}</span>
        </div>
      ))}
    </div>
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

      {tab === 'standings' && <ResultsTable round={race.round} />}
      {tab === 'qualifying' && <QualifyingTable round={race.round} />}
      {tab === 'fp1' && <PracticeTable round={race.round} type="fp1" />}
      {tab === 'fp2' && <PracticeTable round={race.round} type="fp2" />}
      {tab === 'fp3' && <PracticeTable round={race.round} type="fp3" />}
      {tab === 'sprintQ' && <PracticeTable round={race.round} type="sprint_quali" />}
      {tab === 'sprint' && <SprintTable round={race.round} />}
    </div>
  )
}
