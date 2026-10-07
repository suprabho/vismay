'use client'

import { useQuery } from '@tanstack/react-query'
import type { RaceRecap } from './types'

/**
 * The recap for a telemetry session from /api/recap/<sessionKey>. Resolves to
 * null when the session isn't ingested (404), so the page can fall back to
 * the sample story.
 */
export function useRaceRecap(sessionKey: string | null) {
  return useQuery({
    enabled: !!sessionKey,
    queryKey: ['vizf1', 'recap', sessionKey],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<RaceRecap | null> => {
      const res = await fetch(`/api/recap/${encodeURIComponent(sessionKey!)}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`recap ${res.status}`)
      return (await res.json()) as RaceRecap
    },
  })
}
