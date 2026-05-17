'use client'

import { useQuery } from '@tanstack/react-query'
import {
  ConstructorStandingSchema,
  type ConstructorStandingApi,
} from '@vizf1/shared'
import type { ConstructorStandingRow } from '@vismay/f1-viz/types'
import { fetchJolpica } from './jolpica'

type StandingsEnvelope = {
  StandingsTable: {
    season: string
    StandingsLists: Array<{ ConstructorStandings: ConstructorStandingApi[] }>
  }
}

function apiToRow(api: ConstructorStandingApi): ConstructorStandingRow {
  return {
    position: Number(api.position),
    constructorId: api.Constructor.constructorId,
    constructorName: api.Constructor.name,
    nationality: api.Constructor.nationality ?? null,
    points: Number(api.points),
    wins: Number(api.wins),
  }
}

export function useConstructorStandings() {
  return useQuery({
    queryKey: ['vizf1', 'constructor-standings', 'current'],
    queryFn: async () => {
      const rows = await fetchJolpica<ConstructorStandingApi, StandingsEnvelope>(
        'current/constructorstandings',
        (m) => m.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? [],
        ConstructorStandingSchema,
      )
      return rows.map(apiToRow)
    },
  })
}
