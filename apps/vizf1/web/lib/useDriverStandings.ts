'use client'

import { useQuery } from '@tanstack/react-query'
import { DriverStandingSchema, type DriverStandingApi } from '@vizf1/shared'
import type { DriverStandingRow } from '@vismay/f1-viz/types'
import { fetchJolpica } from './jolpica'

type StandingsEnvelope = {
  StandingsTable: {
    season: string
    StandingsLists: Array<{ DriverStandings: DriverStandingApi[] }>
  }
}

function apiToRow(api: DriverStandingApi): DriverStandingRow {
  const first = api.Constructors[0]
  return {
    position: Number(api.position),
    driverId: api.Driver.driverId,
    driverCode: api.Driver.code ?? null,
    driverName: `${api.Driver.givenName} ${api.Driver.familyName}`,
    constructorId: first?.constructorId ?? 'unknown',
    constructorName: first?.name ?? 'Unknown',
    points: Number(api.points),
    wins: Number(api.wins),
  }
}

export function useDriverStandings() {
  return useQuery({
    queryKey: ['vizf1', 'driver-standings', 'current'],
    queryFn: async () => {
      // The StandingsLists wrapper holds one entry per season. We pick [0] and
      // map its DriverStandings — fetchJolpica's row-extractor handles the
      // unwrap in one shot.
      const rows = await fetchJolpica<DriverStandingApi, StandingsEnvelope>(
        'current/driverstandings',
        (m) => m.StandingsTable.StandingsLists[0]?.DriverStandings ?? [],
        DriverStandingSchema,
      )
      return rows.map(apiToRow)
    },
  })
}
