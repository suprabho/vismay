'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

export type SessionType = 'fp1' | 'fp2' | 'fp3' | 'quali' | 'sprint_quali' | 'sprint' | 'race'

export type SessionResultRow = {
  driverId: string
  driverName: string
  driverCode: string | null
  constructorId: string | null
  constructorName: string | null
  constructorColor: string | null
  headshotUrl: string | null
  position: number | null
  bestLapMs: number | null
  gapToLeaderMs: number | null
  lapsCompleted: number | null
  status: string | null
  points: number | null
  grid: number | null
}

type DbRow = {
  driver_id: string
  position: number | null
  best_lap_ms: number | null
  gap_to_leader_ms: number | null
  laps_completed: number | null
  status: string | null
  points: number | null
  grid: number | null
  drivers: {
    given_name: string
    family_name: string
    code: string | null
    headshot_url: string | null
    constructor_id: string | null
    primary_color: string | null
    constructors: { name: string } | null
  } | null
}

function rowToResult(r: DbRow): SessionResultRow {
  const d = r.drivers
  return {
    driverId: r.driver_id,
    driverName: d ? `${d.given_name} ${d.family_name}` : r.driver_id,
    driverCode: d?.code ?? null,
    constructorId: d?.constructor_id ?? null,
    constructorName: d?.constructors?.name ?? null,
    constructorColor: d?.primary_color ?? null,
    headshotUrl: d?.headshot_url ?? null,
    position: r.position,
    bestLapMs: r.best_lap_ms,
    gapToLeaderMs: r.gap_to_leader_ms,
    lapsCompleted: r.laps_completed,
    status: r.status,
    points: r.points,
    grid: r.grid,
  }
}

export function useSessionResults(round: number | null, type: SessionType) {
  return useQuery({
    enabled: round != null,
    queryKey: ['vizf1', 'session-results', round, type],
    queryFn: async (): Promise<SessionResultRow[]> => {
      const sb = supabaseBrowser()
      const year = String(new Date().getFullYear())
      // Resolve race id, then session id, then results — keeps the join shallow
      // and tolerant of races/sessions being upserted by different jobs.
      const { data: race } = await sb
        .from('vizf1_races')
        .select('id')
        .eq('season', year)
        .eq('round', round!)
        .maybeSingle()
      if (!race) return []
      const { data: session } = await sb
        .from('vizf1_sessions')
        .select('id')
        .eq('race_id', race.id)
        .eq('session_type', type)
        .maybeSingle()
      if (!session) return []
      const { data, error } = await sb
        .from('vizf1_session_results')
        .select(
          'driver_id, position, best_lap_ms, gap_to_leader_ms, laps_completed, status, points, grid, drivers:vizf1_drivers(given_name, family_name, code, headshot_url, constructor_id, primary_color, constructors:vizf1_constructors(name))',
        )
        .eq('session_id', session.id)
        .order('position', { ascending: true, nullsFirst: false })
      if (error) throw error
      return ((data ?? []) as unknown as DbRow[]).map(rowToResult)
    },
  })
}

export function formatLapMs(ms: number | null): string {
  if (ms == null) return '—'
  const m = Math.floor(ms / 60_000)
  const s = (ms - m * 60_000) / 1000
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3)
}

export function formatGapMs(ms: number | null): string {
  if (ms == null || ms === 0) return ''
  return `+${(ms / 1000).toFixed(3)}`
}
