'use client'

import { useQuery } from '@tanstack/react-query'
import { RaceSchema, type RaceApi } from '@vizf1/shared'
import type { RaceRow } from '@vismay/f1-viz/types'
import { fetchJolpica } from './jolpica'

type RaceTableEnvelope = {
  RaceTable: { season: string; Races: RaceApi[] }
}

function statusFor(date: string, time: string | undefined): RaceRow['status'] {
  const now = Date.now()
  const start = new Date(`${date}T${time ?? '00:00:00Z'}`).getTime()
  if (start + 4 * 60 * 60 * 1000 < now) return 'finished'
  if (start < now) return 'live'
  return 'upcoming'
}

export function raceApiToRow(r: RaceApi): RaceRow {
  return {
    id: `${r.season}-${r.round}`,
    season: r.season,
    round: Number(r.round),
    raceName: r.raceName,
    circuitId: r.Circuit.circuitId,
    circuitName: r.Circuit.circuitName,
    country: r.Circuit.Location.country,
    locality: r.Circuit.Location.locality ?? null,
    date: r.date,
    time: r.time ?? null,
    status: statusFor(r.date, r.time),
    hasSprint: Boolean(r.Sprint),
  }
}

export function useSchedule() {
  return useQuery({
    queryKey: ['vizf1', 'schedule', 'current'],
    queryFn: async () => {
      const races = await fetchJolpica<RaceApi, RaceTableEnvelope>(
        'current',
        (m) => m.RaceTable.Races,
        RaceSchema,
      )
      return races.map(raceApiToRow)
    },
  })
}
