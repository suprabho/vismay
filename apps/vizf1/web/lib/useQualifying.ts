'use client'

import { useQuery } from '@tanstack/react-query'
import { QualifyingResultSchema, type QualifyingResultApi } from '@vizf1/shared'
import type { QualifyingRow } from '@vismay/f1-viz/types'
import { fetchJolpica } from './jolpica'

type QualifyingEnvelope = {
  RaceTable: {
    season: string
    round: string
    Races: Array<{ QualifyingResults: QualifyingResultApi[] }>
  }
}

function apiToRow(api: QualifyingResultApi): QualifyingRow {
  return {
    position: Number(api.position),
    driverId: api.Driver.driverId,
    driverCode: api.Driver.code ?? null,
    driverName: `${api.Driver.givenName} ${api.Driver.familyName}`,
    constructorId: api.Constructor.constructorId,
    constructorName: api.Constructor.name,
    q1: api.Q1 ?? null,
    q2: api.Q2 ?? null,
    q3: api.Q3 ?? null,
  }
}

export function useQualifying(round: number | string | null) {
  return useQuery({
    enabled: round != null,
    queryKey: ['vizf1', 'qualifying', String(round)],
    queryFn: async () => {
      const rows = await fetchJolpica<QualifyingResultApi, QualifyingEnvelope>(
        `current/${round}/qualifying`,
        (m) => m.RaceTable.Races[0]?.QualifyingResults ?? [],
        QualifyingResultSchema,
      )
      return rows.map(apiToRow)
    },
  })
}
