'use client'

import { useState } from 'react'
import type { RaceRow } from '@vismay/f1-viz/types'
import { useRaceResults } from '@/lib/useRaceResults'
import { useQualifying } from '@/lib/useQualifying'

type Tab = 'standings' | 'qualifying' | 'fp1' | 'fp2' | 'sprintQ' | 'sprint'

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

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center text-xs text-muted">
      {label} — coming soon
    </div>
  )
}

function ResultsTable({ round }: { round: number }) {
  const q = useRaceResults(round)
  if (q.isLoading) return <ComingSoon label="Loading results" />
  if (q.error) return <ComingSoon label="No results yet" />
  const rows = q.data ?? []
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
  if (q.isLoading) return <ComingSoon label="Loading qualifying" />
  if (q.error) return <ComingSoon label="No qualifying yet" />
  const rows = q.data ?? []
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

export function RaceWeekendTabs({ race }: { race: RaceRow }) {
  const [tab, setTab] = useState<Tab>('standings')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        <TabButton active={tab === 'standings'} onClick={() => setTab('standings')}>
          Standings
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
      {tab === 'fp1' && <ComingSoon label="FP1 results" />}
      {tab === 'fp2' && <ComingSoon label="FP2 results" />}
      {tab === 'sprintQ' && <ComingSoon label="Sprint qualifying" />}
      {tab === 'sprint' && <ComingSoon label="Sprint race" />}
    </div>
  )
}
