'use client'

import { useQuery } from '@tanstack/react-query'
import { RaceResultSchema, type RaceResultApi } from '@vizf1/shared'
import type { RaceResultRow } from '@vismay/f1-viz/types'
import { fetchJolpica } from './jolpica'

type ResultsEnvelope = {
  RaceTable: {
    season: string
    round: string
    Races: Array<{ Results: RaceResultApi[] }>
  }
}

function apiToRow(api: RaceResultApi): RaceResultRow {
  return {
    position: Number(api.position),
    driverId: api.Driver.driverId,
    driverCode: api.Driver.code ?? null,
    driverName: `${api.Driver.givenName} ${api.Driver.familyName}`,
    constructorId: api.Constructor.constructorId,
    constructorName: api.Constructor.name,
    grid: Number(api.grid),
    laps: Number(api.laps),
    status: api.status,
    time: api.Time?.time ?? null,
    points: Number(api.points),
  }
}

export function useRaceResults(round: number | string | null) {
  return useQuery({
    enabled: round != null,
    queryKey: ['vizf1', 'race-results', String(round)],
    queryFn: async () => {
      const rows = await fetchJolpica<RaceResultApi, ResultsEnvelope>(
        `current/${round}/results`,
        (m) => m.RaceTable.Races[0]?.Results ?? [],
        RaceResultSchema,
      )
      return rows.map(apiToRow)
    },
  })
}
