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
import { useTelemetrySession } from '@/lib/useTelemetrySession'
import { RaceTelemetry } from './RaceTelemetry'
import { TeamBadge } from './TeamBadge'

type Tab = 'standings' | 'qualifying' | 'fp1' | 'fp2' | 'fp3' | 'sprintQ' | 'sprint' | 'telemetry'

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
 *   race / sprint  — pos | team-badge+driver | team | laps | best lap
 *   quali / sprintQ — pos | team-badge+driver | team | best lap | gap
 *   fp1 / fp2 / fp3 — pos | team-badge+driver | best lap | gap | laps
 */

const RACE_LIKE: SessionType[] = ['race', 'sprint']
const QUALI_LIKE: SessionType[] = ['quali', 'sprint_quali']

function DriverCell({
  name,
  constructorId,
  constructorName,
  constructorColor,
  constructorLogoUrl,
}: {
  name: string
  constructorId: string | null
  constructorName: string | null
  constructorColor: string | null
  constructorLogoUrl: string | null
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {/* Team logo (or tinted team initials when no logo is available) so the
          row reads as "which car" at a glance — the driver's own name sits
          right next to it, so a driver-code chip was redundant. */}
      <TeamBadge
        constructorId={constructorId}
        name={constructorName ?? constructorId ?? ''}
        color={constructorColor}
        logoUrl={constructorLogoUrl}
        size="sm"
      />
      <span className="truncate wdth-dense font-semibold text-text">{name}</span>
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
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div className="min-w-[470px] wdth-dense grid grid-cols-[28px_minmax(110px,1fr)_80px_40px_88px] items-center gap-1 border-b border-border bg-bg px-3 py-2 wdth-kicker text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
          <span>#</span>
          <span>Driver</span>
          <span>Team</span>
          <span className="text-center">Laps</span>
          <span className="text-center">Best</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.driverId}
            className="min-w-[470px] wdth-dense grid grid-cols-[28px_minmax(110px,1fr)_80px_40px_88px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
          >
            <span className="font-mono text-text">{r.position ?? i + 1}</span>
            <DriverCell
              name={r.driverName}
              constructorId={r.constructorId}
              constructorName={r.constructorName}
              constructorColor={r.constructorColor}
              constructorLogoUrl={r.constructorLogoUrl}
            />
            <span className="truncate font-semibold text-muted">{r.constructorName ?? ''}</span>
            <span className="text-center font-mono text-text">{r.lapsCompleted ?? '—'}</span>
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
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div className="min-w-[470px] wdth-dense grid grid-cols-[28px_minmax(110px,1fr)_80px_88px_88px] items-center gap-1 border-b border-border bg-bg px-3 py-2 wdth-kicker text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
          <span>#</span>
          <span>Driver</span>
          <span>Team</span>
          <span className="text-center">Best</span>
          <span className="text-center">Gap</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.driverId}
            className="min-w-[470px] wdth-dense grid grid-cols-[28px_minmax(110px,1fr)_80px_88px_88px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
          >
            <span className="font-mono text-text">{r.position ?? i + 1}</span>
            <DriverCell
              name={r.driverName}
              constructorId={r.constructorId}
              constructorName={r.constructorName}
              constructorColor={r.constructorColor}
              constructorLogoUrl={r.constructorLogoUrl}
            />
            <span className="truncate font-semibold text-muted">{r.constructorName ?? ''}</span>
            <span className="text-center font-mono text-[11px] text-text/80">
              {formatLapMs(r.bestLapMs)}
            </span>
            <span className="text-center font-mono text-[11px] italic text-muted">
              {formatGapMs(r.gapToLeaderMs)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Practice: pos | driver | best | gap | laps
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <div className="min-w-[470px] wdth-dense grid grid-cols-[28px_minmax(110px,1fr)_88px_88px_40px] items-center gap-1 border-b border-border bg-bg px-3 py-2 wdth-kicker text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        <span>#</span>
        <span>Driver</span>
        <span className="text-center">Best</span>
        <span className="text-center">Gap</span>
        <span className="text-center">Laps</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.driverId}
          className="min-w-[470px] wdth-dense grid grid-cols-[28px_minmax(110px,1fr)_88px_88px_40px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0"
        >
          <span className="font-mono text-text">{r.position ?? i + 1}</span>
          <DriverCell
              name={r.driverName}
              constructorId={r.constructorId}
              constructorName={r.constructorName}
              constructorColor={r.constructorColor}
              constructorLogoUrl={r.constructorLogoUrl}
            />
          <span className="text-center font-mono text-[11px] text-text/80">
            {formatLapMs(r.bestLapMs)}
          </span>
          <span className="text-center font-mono text-[11px] italic text-muted">
            {formatGapMs(r.gapToLeaderMs)}
          </span>
          <span className="text-center font-mono text-muted">{r.lapsCompleted ?? '—'}</span>
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
  // The Telemetry tab only appears when a race telemetry session is ingested.
  // Linked by GP name (telemetry/schedule round numbers differ).
  const hasTelemetry = !!useTelemetrySession(race.raceName).data

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
        {hasTelemetry ? (
          <TabButton active={tab === 'telemetry'} onClick={() => setTab('telemetry')}>
            Telemetry
          </TabButton>
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
      {tab === 'telemetry' && <RaceTelemetry raceName={race.raceName} />}
    </div>
  )
}
