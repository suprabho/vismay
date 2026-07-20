'use client'

import { useQuery } from '@tanstack/react-query'
import type { DriverLane } from '@vismay/f1-viz/types'
import { supabaseBrowser } from './supabaseBrowser'

type DriverMeta = {
  driverId: string
  driverCode: string | null
  driverName: string
  constructorId: string
  constructorColor?: string | null
}

type LapRow = {
  driver_id: string
  lap: number
  position: number
}

/**
 * Per-lap finishing order for the given race, charted as DriverLane[].
 * Source: vizf1_session_lap_positions, populated by the worker.
 */
export function useLapPositions(
  round: number | string | null,
  drivers: DriverMeta[],
) {
  return useQuery({
    enabled: round != null && drivers.length > 0,
    queryKey: ['vizf1', 'laps', String(round)],
    queryFn: async (): Promise<{ totalLaps: number; lanes: DriverLane[] }> => {
      const sb = supabaseBrowser()
      const year = String(new Date().getFullYear())

      const { data: race } = await sb
        .from('vizf1_races')
        .select('id')
        .eq('season', year)
        .eq('round', Number(round))
        .maybeSingle()
      if (!race) return { totalLaps: 0, lanes: [] }

      const { data: session } = await sb
        .from('vizf1_sessions')
        .select('id')
        .eq('race_id', race.id)
        .eq('session_type', 'race')
        .maybeSingle()
      if (!session) return { totalLaps: 0, lanes: [] }

      const { data, error } = await sb
        .from('vizf1_session_lap_positions')
        .select('driver_id, lap, position')
        .eq('session_id', session.id)
      if (error) throw error

      const rows = (data ?? []) as LapRow[]

      const byDriver = new Map<string, { lap: number; position: number }[]>()
      let totalLaps = 0
      for (const r of rows) {
        if (r.lap > totalLaps) totalLaps = r.lap
        const arr = byDriver.get(r.driver_id) ?? []
        arr.push({ lap: r.lap, position: r.position })
        byDriver.set(r.driver_id, arr)
      }
      for (const arr of byDriver.values()) arr.sort((a, b) => a.lap - b.lap)

      // Headshots for the end-of-line avatars. The driver meta passed in (from
      // useSessionResults) carries no headshot, so look them up directly.
      const { data: heads } = await sb
        .from('vizf1_drivers')
        .select('driver_id, headshot_url')
        .in(
          'driver_id',
          drivers.map((d) => d.driverId),
        )
      const headshots = new Map(
        ((heads ?? []) as { driver_id: string; headshot_url: string | null }[]).map(
          (h) => [h.driver_id, h.headshot_url],
        ),
      )

      const lanes: DriverLane[] = drivers
        .map((d) => ({
          driverId: d.driverId,
          driverCode: d.driverCode,
          driverName: d.driverName,
          color: d.constructorColor ?? '#9ca3af',
          headshotUrl: headshots.get(d.driverId) ?? null,
          points: byDriver.get(d.driverId) ?? [],
        }))
        .filter((l) => l.points.length > 0)

      return { totalLaps, lanes }
    },
  })
}
