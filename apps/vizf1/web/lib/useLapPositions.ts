'use client'

import { useQuery } from '@tanstack/react-query'
import { LapSchema, type LapApi } from '@vizf1/shared'
import type { DriverLane, LapPosition } from '@vismay/f1-viz/types'
import { F1_BRAND, type ConstructorId } from '@vizf1/brand'
import { fetchJolpicaPaginated } from './jolpica'

type LapsEnvelope = {
  RaceTable: {
    season: string
    round: string
    Races: Array<{ Laps: LapApi[] }>
  }
}

type DriverMeta = {
  driverId: string
  driverCode: string | null
  driverName: string
  constructorId: string
}

function laneColor(constructorId: string): string {
  const key = constructorId as ConstructorId
  return F1_BRAND.constructors[key] ?? F1_BRAND.colors.muted
}

/**
 * Build per-driver lane series from the paginated /laps payload.
 *
 * Jolpica's /laps response is a list of lap objects; each lap has Timings
 * with `driverId + position`. We pivot to `driverId -> [{lap, position}]`.
 * Driver names and constructor associations are passed in (from race results)
 * because /laps itself only has IDs.
 */
export function useLapPositions(
  round: number | string | null,
  drivers: DriverMeta[],
) {
  return useQuery({
    enabled: round != null && drivers.length > 0,
    queryKey: ['vizf1', 'laps', String(round)],
    queryFn: async (): Promise<{ totalLaps: number; lanes: DriverLane[] }> => {
      const laps = await fetchJolpicaPaginated<LapApi, LapsEnvelope>(
        `current/${round}/laps`,
        (m) => m.RaceTable.Races[0]?.Laps ?? [],
        LapSchema,
      )

      const byDriver = new Map<string, LapPosition[]>()
      let totalLaps = 0
      for (const lap of laps) {
        const lapNum = Number(lap.number)
        if (lapNum > totalLaps) totalLaps = lapNum
        for (const t of lap.Timings) {
          const points = byDriver.get(t.driverId) ?? []
          points.push({ lap: lapNum, position: Number(t.position) })
          byDriver.set(t.driverId, points)
        }
      }

      const lanes: DriverLane[] = drivers
        .map((d) => ({
          driverId: d.driverId,
          driverCode: d.driverCode,
          driverName: d.driverName,
          color: laneColor(d.constructorId),
          points: byDriver.get(d.driverId) ?? [],
        }))
        .filter((l) => l.points.length > 0)

      return { totalLaps, lanes }
    },
  })
}
