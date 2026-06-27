'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

export interface TelemetryDriver {
  number: number
  abbr: string
  name: string
  teamColour: string
}

export interface TelemetrySessionInfo {
  sessionKey: string
  /** Position frames ingested — the clip/3D widgets need this to play. */
  ready: boolean
  drivers: TelemetryDriver[]
  /** Driver numbers ordered by race finish (position asc); [] if no results yet. */
  finishingOrder: number[]
}

interface DriverJson {
  driverNumber: number
  fullName?: string
  abbreviation?: string
  teamColour?: string
}
interface ResultJson {
  driverNumber?: number
  position?: number | null
}
interface Row {
  session_key: string
  positions_status: string | null
  drivers: DriverJson[] | null
  session_results: ResultJson[] | null
}

/**
 * Resolve a race to its ingested telemetry session by GRAND PRIX NAME, not round.
 * FastF1 telemetry and the OpenF1 schedule number rounds differently (FastF1
 * skips pre-season testing, so e.g. the Australian GP is telemetry round 1 but
 * schedule round 3) — the gp name is the stable link. Returns null when no
 * telemetry exists for the race (gates the race page's Telemetry tab).
 * Everything else is keyed by driver NUMBER (telemetry-native) — roster and
 * finishing order both come from the self-contained `vizf1_telemetry_sessions`
 * row, so there's no slug↔number mapping against the results tables.
 */
export function useTelemetrySession(raceName: string | null) {
  return useQuery({
    enabled: !!raceName,
    queryKey: ['vizf1', 'telemetry-session', raceName],
    queryFn: async (): Promise<TelemetrySessionInfo | null> => {
      const sb = supabaseBrowser()
      const year = new Date().getFullYear()
      const { data, error } = await sb
        .from('vizf1_telemetry_sessions')
        .select('session_key, positions_status, drivers, session_results')
        .eq('season', year)
        .eq('session_type', 'R')
        .ilike('gp_name', raceName!)
        .limit(1)
      if (error) throw error
      const row0 = (data ?? [])[0]
      if (!row0) return null
      const r = row0 as Row

      const drivers: TelemetryDriver[] = (r.drivers ?? []).map((d) => ({
        number: d.driverNumber,
        abbr: d.abbreviation ?? `#${d.driverNumber}`,
        name: d.fullName ?? '',
        teamColour: d.teamColour ?? '#9ca3af',
      }))
      const finishingOrder = (r.session_results ?? [])
        .filter((x) => x.driverNumber != null && x.position != null)
        .sort((a, b) => a.position! - b.position!)
        .map((x) => x.driverNumber!)

      return {
        sessionKey: r.session_key,
        ready: r.positions_status === 'done',
        drivers,
        finishingOrder,
      }
    },
  })
}
