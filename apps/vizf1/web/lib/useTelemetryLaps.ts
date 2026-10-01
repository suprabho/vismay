'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'
import type { LapRow } from './lapChart'

export interface TelemetryLapsResult {
  /** Per-lap rows for the selected drivers — `buildLapChartSpec` turns them into a chart. */
  rows: LapRow[]
  /** Fastest lap across the selected drivers (annotated on the chart). */
  fastest: { driverNumber: number; lap: number } | null
  /**
   * Fastest lap that also has channel telemetry ingested — the clip's default
   * window. Usually identical to `fastest`, but a session whose live-timing
   * feed broke mid-race (2026 Monaco: channels exist only for laps 1-5 and the
   * finish) keeps lap timing for every lap while telemetry covers a few, and
   * pointing the clip at an uncovered lap renders an empty player. Falls back
   * to `fastest` when no lap has coverage.
   */
  fastestWithTelemetry: { driverNumber: number; lap: number } | null
  /** Highest lap number seen (clamps the lap-range control). */
  maxLap: number
}

const COLUMNS =
  'driver_number, lap, lap_time_sec, sectors, compound, tyre_life, position, events, avg_speed, max_speed, avg_throttle_pct, braking_events, drs_activations, avg_gap_to_ahead_m'
/** PostgREST caps a response at 1000 rows; a full grid of laps runs past that. */
const PAGE = 1000

/**
 * Lap rows from `vizf1_telemetry_laps` for the selected drivers, plus the
 * fastest lap. Public-read RLS lets the browser client query it directly, like
 * the other vizf1 hooks; the chart spec is built from these rows by the page so
 * metric / filter switches don't refetch.
 */
export function useTelemetryLaps(sessionKey: string | null, selected: number[]) {
  const selKey = [...selected].sort((a, b) => a - b).join(',')
  return useQuery({
    enabled: !!sessionKey && selected.length > 0,
    queryKey: ['vizf1', 'telemetry-laps', sessionKey, selKey],
    queryFn: async (): Promise<TelemetryLapsResult> => {
      const sb = supabaseBrowser()
      const laps: LapRow[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from('vizf1_telemetry_laps')
          .select(COLUMNS)
          .eq('session_key', sessionKey!)
          .in('driver_number', selected)
          .order('lap', { ascending: true })
          .order('driver_number', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw error
        laps.push(...((data ?? []) as LapRow[]))
        if (!data || data.length < PAGE) break
      }

      let fastest: { driverNumber: number; lap: number } | null = null
      let fastestWithTelemetry: { driverNumber: number; lap: number } | null = null
      let best = Infinity
      let bestCovered = Infinity
      let maxLap = 0
      for (const l of laps) {
        if (l.lap > maxLap) maxLap = l.lap
        if (l.lap_time_sec == null || l.lap_time_sec <= 0) continue
        if (l.lap_time_sec < best) {
          best = l.lap_time_sec
          fastest = { driverNumber: l.driver_number, lap: l.lap }
        }
        if (l.max_speed != null && l.lap_time_sec < bestCovered) {
          bestCovered = l.lap_time_sec
          fastestWithTelemetry = { driverNumber: l.driver_number, lap: l.lap }
        }
      }
      fastestWithTelemetry = fastestWithTelemetry ?? fastest

      return { rows: laps, fastest, fastestWithTelemetry, maxLap }
    },
  })
}
