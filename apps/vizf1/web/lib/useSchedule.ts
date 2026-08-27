'use client'

import { useQuery } from '@tanstack/react-query'
import type { RaceRow } from '@vismay/f1-viz/types'
import { supabaseBrowser } from './supabaseBrowser'

type RaceDbRow = {
  id: string
  season: string
  round: number
  race_name: string
  circuit_id: string | null
  date: string
  time: string | null
  has_sprint: boolean
  circuits: {
    name: string
    locality: string | null
    country: string | null
  } | null
  // Inner-joined race session, used to surface the *real* finished/pending
  // state — race day passing isn't enough, OpenF1 also has to have published
  // the results.
  vizf1_sessions: { status: string }[]
}

function statusFor(
  date: string,
  time: string | undefined | null,
  raceSessionStatus: string | undefined,
): RaceRow['status'] {
  if (raceSessionStatus === 'finished') return 'finished'
  // Set by ingestSessions when a long-past session never produced any data
  // (e.g. the canceled 2026 Bahrain/Saudi rounds) — without this the date
  // fallback below would show a canceled race as perpetually "live".
  if (raceSessionStatus === 'canceled') return 'canceled'
  const now = Date.now()
  const start = new Date(`${date}T${time ?? '00:00:00Z'}`).getTime()
  if (start < now) return 'live'
  return 'upcoming'
}

function dbRowToRow(r: RaceDbRow): RaceRow {
  const raceSession = r.vizf1_sessions?.[0]
  return {
    id: `${r.season}-${r.round}`,
    season: r.season,
    round: r.round,
    raceName: r.race_name,
    circuitId: r.circuit_id ?? '',
    circuitName: r.circuits?.name ?? '',
    country: r.circuits?.country ?? '',
    locality: r.circuits?.locality ?? null,
    date: r.date,
    time: r.time,
    status: statusFor(r.date, r.time, raceSession?.status),
    hasSprint: r.has_sprint,
  }
}

export function useSchedule() {
  return useQuery({
    queryKey: ['vizf1', 'schedule', 'current'],
    queryFn: async (): Promise<RaceRow[]> => {
      const sb = supabaseBrowser()
      const year = String(new Date().getFullYear())
      const { data, error } = await sb
        .from('vizf1_races')
        .select(
          "id, season, round, race_name, circuit_id, date, time, has_sprint, circuits:vizf1_circuits(name, locality, country), vizf1_sessions(status, session_type)",
        )
        .eq('season', year)
        .eq('vizf1_sessions.session_type', 'race')
        // Pre-season testing meetings come from OpenF1 alongside real GPs but
        // they aren't races — no race session, no quali, no points. Hide them.
        .neq('race_name', 'Pre-Season Testing')
        .order('round', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as RaceDbRow[]).map(dbRowToRow)
    },
  })
}
