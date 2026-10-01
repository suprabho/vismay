'use client'

import { useQuery } from '@tanstack/react-query'
import type { RaceEvents } from '@vismay/f1-viz/web'

/**
 * Race events (SC / VSC / red / yellow periods + pit stops) for a telemetry
 * session, from the app's events route. Overlays are optional garnish: a failed
 * fetch resolves to null rather than erroring the tab.
 */
export function useRaceEvents(sessionKey: string | null) {
  return useQuery({
    enabled: !!sessionKey,
    queryKey: ['vizf1', 'race-events', sessionKey],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<RaceEvents | null> => {
      const res = await fetch(`/api/telemetry/${encodeURIComponent(sessionKey!)}/events`)
      if (!res.ok) return null
      return (await res.json()) as RaceEvents
    },
  })
}
