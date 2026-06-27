'use client'

import { useQuery } from '@tanstack/react-query'
import type { GraphSpec, GraphSeries } from '@vismay/f1-viz/web'
import { supabaseBrowser } from './supabaseBrowser'
import type { TelemetryDriver } from './useTelemetrySession'

export interface TelemetryLapsResult {
  /** A ready-to-render lap-time-by-lap GraphSpec for f1:telemetry-chart, or null. */
  spec: GraphSpec | null
  /** Fastest lap across the selected drivers — drives the clip's default window. */
  fastest: { driverNumber: number; lap: number } | null
  /** Highest lap number seen (clamps the lap-range control). */
  maxLap: number
}

interface LapRow {
  driver_number: number
  lap: number
  lap_time_sec: number | null
}

/**
 * Build the telemetry-chart's inline GraphSpec (lap time by lap) from
 * `vizf1_telemetry_laps` for the selected drivers, and derive the fastest lap.
 * The chart module is inline-spec-only (no fetch), so this is where the page
 * turns raw lap rows into a chart definition. Public-read RLS lets the browser
 * client query it directly, like the other vizf1 hooks.
 */
export function useTelemetryLaps(
  sessionKey: string | null,
  drivers: TelemetryDriver[],
  selected: number[],
) {
  const selKey = [...selected].sort((a, b) => a - b).join(',')
  return useQuery({
    enabled: !!sessionKey && selected.length > 0,
    queryKey: ['vizf1', 'telemetry-laps', sessionKey, selKey],
    queryFn: async (): Promise<TelemetryLapsResult> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('vizf1_telemetry_laps')
        .select('driver_number, lap, lap_time_sec')
        .eq('session_key', sessionKey!)
        .in('driver_number', selected)
        .order('lap', { ascending: true })
      if (error) throw error
      const laps = (data ?? []) as LapRow[]

      let fastest: { driverNumber: number; lap: number } | null = null
      let best = Infinity
      let maxLap = 0
      const byLap = new Map<number, Record<string, unknown>>()
      for (const l of laps) {
        if (l.lap > maxLap) maxLap = l.lap
        if (l.lap_time_sec == null || l.lap_time_sec <= 0) continue
        if (l.lap_time_sec < best) {
          best = l.lap_time_sec
          fastest = { driverNumber: l.driver_number, lap: l.lap }
        }
        const row = byLap.get(l.lap) ?? { lap: l.lap }
        row[`drv${l.driver_number}`] = Number(l.lap_time_sec.toFixed(3))
        byLap.set(l.lap, row)
      }
      const dataPoints = [...byLap.values()].sort((a, b) => (a.lap as number) - (b.lap as number))

      const driverMap = new Map(drivers.map((d) => [d.number, d]))
      const series: GraphSeries[] = selected.map((n) => {
        const d = driverMap.get(n)
        return {
          id: `drv${n}`,
          label: d?.abbr ?? `#${n}`,
          driverNumber: n,
          color: d?.teamColour ?? '#9ca3af',
          dataKey: `drv${n}`,
          type: 'actual',
        }
      })

      const spec: GraphSpec | null = dataPoints.length
        ? {
            id: `laptime-${sessionKey}`,
            type: 'multi_line',
            title: 'Lap time by lap',
            xAxis: { key: 'lap', label: 'Lap', unit: '' },
            yAxis: { key: 'sec', label: 'Lap time', unit: 's' },
            series,
            dataPoints,
            ...(fastest
              ? {
                  annotations: [
                    { type: 'line' as const, xValue: fastest.lap, color: '#facc15', label: 'Fastest lap' },
                  ],
                }
              : {}),
          }
        : null

      return { spec, fastest, maxLap }
    },
  })
}
