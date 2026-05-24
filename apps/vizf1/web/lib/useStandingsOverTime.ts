'use client'

import { useQuery } from '@tanstack/react-query'
import type { DriverLane } from '@vismay/f1-viz/types'
import { supabaseBrowser } from './supabaseBrowser'

// Same points tables as useStandings — kept duplicated rather than abstracted
// so each query stays self-contained.
const RACE_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
}
const SPRINT_POINTS: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1,
}

type RawRow = {
  position: number | null
  driver_id: string
  vizf1_sessions: {
    session_type: 'race' | 'sprint'
    vizf1_races: { round: number; season: string }
  }
  drivers: {
    given_name: string
    family_name: string
    code: string | null
    primary_color: string | null
  } | null
}

type SeasonStandingsTimeline = {
  rounds: number[]
  /** Top-N drivers, lane points are per completed race round. */
  lanes: DriverLane[]
}

/**
 * Standings (championship position) after each completed race round.
 *
 * @param topN how many drivers to return lanes for, ordered by final standing
 * @param forceInclude driver_ids that must appear in the output even if they
 *   sit outside the topN cutoff. Useful for driver pages, where the page's
 *   driver may be P21 but we still want their lane.
 */
export function useStandingsOverTime(topN = 6, forceInclude: string[] = []) {
  // Sort to keep cache keys stable across re-renders with the same set.
  const forceKey = [...forceInclude].sort().join(',')
  return useQuery({
    queryKey: ['vizf1', 'standings-over-time', 'current', topN, forceKey],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SeasonStandingsTimeline> => {
      const sb = supabaseBrowser()
      const year = String(new Date().getFullYear())

      const { data, error } = await sb
        .from('vizf1_session_results')
        .select(
          'position, driver_id, vizf1_sessions!inner(session_type, vizf1_races!inner(season, round)), drivers:vizf1_drivers!inner(given_name, family_name, code, primary_color)',
        )
        .in('vizf1_sessions.session_type', ['race', 'sprint'])
        .eq('vizf1_sessions.vizf1_races.season', year)
      if (error) throw error

      const rows = (data ?? []) as unknown as RawRow[]
      if (rows.length === 0) return { rounds: [], lanes: [] }

      // Group results by round and track which rounds actually had a race
      // session — sprints alone shouldn't anchor a timeline step.
      const byRound = new Map<
        number,
        { race: RawRow[]; sprint: RawRow[]; hadRace: boolean }
      >()
      const driverInfo = new Map<
        string,
        { code: string | null; name: string; color: string | null }
      >()

      for (const r of rows) {
        const round = r.vizf1_sessions.vizf1_races.round
        const bucket = byRound.get(round) ?? { race: [], sprint: [], hadRace: false }
        if (r.vizf1_sessions.session_type === 'race') {
          bucket.race.push(r)
          bucket.hadRace = true
        } else {
          bucket.sprint.push(r)
        }
        byRound.set(round, bucket)

        if (r.drivers && !driverInfo.has(r.driver_id)) {
          driverInfo.set(r.driver_id, {
            code: r.drivers.code,
            name: `${r.drivers.given_name} ${r.drivers.family_name}`,
            color: r.drivers.primary_color,
          })
        }
      }

      const rounds = Array.from(byRound.keys())
        .filter((r) => byRound.get(r)?.hadRace)
        .sort((a, b) => a - b)
      if (rounds.length === 0) return { rounds: [], lanes: [] }

      // Walk rounds in order, accumulating points per driver and recording
      // the resulting position after each.
      const cumulativePoints = new Map<string, number>()
      const cumulativeWins = new Map<string, number>()
      const positionsByDriver = new Map<string, { lap: number; position: number }[]>()

      for (const round of rounds) {
        const bucket = byRound.get(round)!
        for (const r of [...bucket.sprint, ...bucket.race]) {
          if (r.position == null) continue
          const isRace = r.vizf1_sessions.session_type === 'race'
          const table = isRace ? RACE_POINTS : SPRINT_POINTS
          const pts = table[r.position] ?? 0
          cumulativePoints.set(
            r.driver_id,
            (cumulativePoints.get(r.driver_id) ?? 0) + pts,
          )
          if (isRace && r.position === 1) {
            cumulativeWins.set(
              r.driver_id,
              (cumulativeWins.get(r.driver_id) ?? 0) + 1,
            )
          }
        }
        const ranked = [...cumulativePoints.entries()].sort(([aId, aPts], [bId, bPts]) => {
          if (bPts !== aPts) return bPts - aPts
          return (cumulativeWins.get(bId) ?? 0) - (cumulativeWins.get(aId) ?? 0)
        })
        ranked.forEach(([driverId], idx) => {
          const list = positionsByDriver.get(driverId) ?? []
          list.push({ lap: round, position: idx + 1 })
          positionsByDriver.set(driverId, list)
        })
      }

      // Final-standings order = order of drivers in the last `ranked`.
      const orderedIds = [...cumulativePoints.entries()]
        .sort(([aId, aPts], [bId, bPts]) => {
          if (bPts !== aPts) return bPts - aPts
          return (cumulativeWins.get(bId) ?? 0) - (cumulativeWins.get(aId) ?? 0)
        })
        .map(([driverId]) => driverId)
      // Top-N first (so the legend ordering matches championship order); then
      // append any forced drivers that didn't make the cut.
      const include = new Set(orderedIds.slice(0, topN))
      for (const id of forceInclude) include.add(id)
      const finalOrder = orderedIds.filter((id) => include.has(id))

      const lanes: DriverLane[] = finalOrder
        .map((driverId) => {
          const info = driverInfo.get(driverId)
          if (!info) return null
          return {
            driverId,
            driverCode: info.code,
            driverName: info.name,
            color: info.color ?? '#9ca3af',
            points: positionsByDriver.get(driverId) ?? [],
          }
        })
        .filter((l): l is DriverLane => l !== null && l.points.length > 0)

      return { rounds, lanes }
    },
  })
}
