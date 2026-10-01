'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

export interface Stint {
  driverNumber: number
  stintNumber: number
  compound: string
  startLap: number
  endLap: number
  totalLaps: number
  pitInLap: number | null
  averageDegPerLap: number | null
}

export interface LapWeather {
  lap: number
  airTemp: number
  trackTemp: number
  humidity: number
  windSpeed: number
  rainfall: boolean
}

export interface SessionStrategy {
  stints: Stint[]
  weather: LapWeather[]
}

/**
 * Tyre stints + per-lap weather for one telemetry session. Separate from
 * `useTelemetrySession` (which scans the whole season's rows) so only the open
 * race pays for these blobs.
 */
export function useSessionStrategy(sessionKey: string | null) {
  return useQuery({
    enabled: !!sessionKey,
    queryKey: ['vizf1', 'session-strategy', sessionKey],
    queryFn: async (): Promise<SessionStrategy> => {
      const { data, error } = await supabaseBrowser()
        .from('vizf1_telemetry_sessions')
        .select('stints, weather_data')
        .eq('session_key', sessionKey!)
        .maybeSingle()
      if (error) throw error
      const row = (data ?? {}) as { stints?: Stint[] | null; weather_data?: LapWeather[] | null }
      return {
        stints: Array.isArray(row.stints) ? row.stints : [],
        weather: Array.isArray(row.weather_data) ? row.weather_data : [],
      }
    },
  })
}
