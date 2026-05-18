'use client'

import { useQuery } from '@tanstack/react-query'
import { RaceSchema, type RaceApi } from '@vizf1/shared'
import type { RaceRow } from '@vismay/f1-viz/types'
import { fetchJolpica } from './jolpica'
import { supabaseBrowser } from './supabaseBrowser'

type RaceTableEnvelope = {
  RaceTable: { season: string; Races: RaceApi[] }
}

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
}

function statusFor(date: string, time: string | undefined | null): RaceRow['status'] {
  const now = Date.now()
  const start = new Date(`${date}T${time ?? '00:00:00Z'}`).getTime()
  if (start + 4 * 60 * 60 * 1000 < now) return 'finished'
  if (start < now) return 'live'
  return 'upcoming'
}

function dbRowToRow(r: RaceDbRow): RaceRow {
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
    status: statusFor(r.date, r.time),
    hasSprint: r.has_sprint,
  }
}

export function raceApiToRow(r: RaceApi): RaceRow {
  return {
    id: `${r.season}-${r.round}`,
    season: r.season,
    round: Number(r.round),
    raceName: r.raceName,
    circuitId: r.Circuit.circuitId,
    circuitName: r.Circuit.circuitName,
    country: r.Circuit.Location.country,
    locality: r.Circuit.Location.locality ?? null,
    date: r.date,
    time: r.time ?? null,
    status: statusFor(r.date, r.time),
    hasSprint: Boolean(r.Sprint),
  }
}

/**
 * Read schedule from Supabase first; fall back to Jolpica if the DB hasn't
 * been seeded yet (cold-start). This keeps `pnpm dev` usable before the
 * worker has ever run.
 */
export function useSchedule() {
  return useQuery({
    queryKey: ['vizf1', 'schedule', 'current'],
    queryFn: async (): Promise<RaceRow[]> => {
      try {
        const sb = supabaseBrowser()
        const year = String(new Date().getFullYear())
        const { data, error } = await sb
          .from('races')
          .select(
            'id, season, round, race_name, circuit_id, date, time, has_sprint, circuits(name, locality, country)',
          )
          .eq('season', year)
          .order('round', { ascending: true })
        if (error) throw error
        if (data && data.length > 0) {
          return (data as unknown as RaceDbRow[]).map(dbRowToRow)
        }
      } catch (e) {
        console.warn('[useSchedule] Supabase read failed, falling back to Jolpica:', e)
      }
      const races = await fetchJolpica<RaceApi, RaceTableEnvelope>(
        'current',
        (m) => m.RaceTable.Races,
        RaceSchema,
      )
      return races.map(raceApiToRow)
    },
  })
}
