'use client'

import { useQuery } from '@tanstack/react-query'
import type { DriverLane } from '@vismay/f1-viz/types'
import { supabaseBrowser } from './supabaseBrowser'

// Same points tables as useStandingsOverTime — kept duplicated so each query
// stays self-contained.
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
  vizf1_drivers: {
    primary_color: string | null
    constructor_id: string | null
    vizf1_constructors: {
      name: string
      primary_color: string | null
    } | null
  } | null
}

type ConstructorTimeline = {
  rounds: number[]
  /**
   * Top-N constructors by final standing. We borrow the DriverLane shape so
   * PositionChart can render this without a parallel API; the `driverId`
   * field carries the constructor_id and `driverCode` is an abbreviation of
   * the constructor name. TODO: generalise DriverLane → EntityLane once a
   * second consumer (e.g. circuit timelines) appears.
   */
  lanes: DriverLane[]
}

function abbreviate(name: string): string {
  // First letter of each word, max 3 chars. "Red Bull Racing" → "RBR",
  // "Aston Martin" → "AM", "Ferrari" → "FER".
  const words = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 3)
}

/**
 * Constructors' championship position after each completed race round.
 *
 * @param topN how many constructors to return lanes for, ordered by final standing
 * @param forceInclude constructor_ids that must appear in the output even if
 *   they sit outside the topN cutoff. Useful for team pages where the page's
 *   team may be P10 but we still want their lane against the front-runners.
 */
export function useConstructorStandingsOverTime(
  topN = 5,
  forceInclude: string[] = [],
) {
  const forceKey = [...forceInclude].sort().join(',')
  return useQuery({
    queryKey: ['vizf1', 'constructor-standings-over-time', 'current', topN, forceKey],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConstructorTimeline> => {
      const sb = supabaseBrowser()
      const year = String(new Date().getFullYear())

      const { data, error } = await sb
        .from('vizf1_session_results')
        .select(
          'position, driver_id, vizf1_sessions!inner(session_type, vizf1_races!inner(season, round)), vizf1_drivers!inner(primary_color, constructor_id, vizf1_constructors(name, primary_color))',
        )
        .in('vizf1_sessions.session_type', ['race', 'sprint'])
        .eq('vizf1_sessions.vizf1_races.season', year)
      if (error) throw error

      const rows = (data ?? []) as unknown as RawRow[]
      if (rows.length === 0) return { rounds: [], lanes: [] }

      // Group by round and track race vs sprint so a sprint-only weekend
      // doesn't anchor a timeline step.
      const byRound = new Map<
        number,
        { race: RawRow[]; sprint: RawRow[]; hadRace: boolean }
      >()
      const constructorInfo = new Map<
        string,
        { name: string; color: string | null; abbr: string }
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

        const cId = r.vizf1_drivers?.constructor_id
        if (cId && !constructorInfo.has(cId)) {
          const name = r.vizf1_drivers?.vizf1_constructors?.name ?? cId
          constructorInfo.set(cId, {
            name,
            // Prefer the driver row's primary_color (matches OpenF1 team
            // colour) before the constructors table's, matching the
            // convention in useStandings.
            color:
              r.vizf1_drivers?.primary_color ??
              r.vizf1_drivers?.vizf1_constructors?.primary_color ??
              null,
            abbr: abbreviate(name),
          })
        }
      }

      const rounds = Array.from(byRound.keys())
        .filter((r) => byRound.get(r)?.hadRace)
        .sort((a, b) => a - b)
      if (rounds.length === 0) return { rounds: [], lanes: [] }

      // Walk rounds in order, accumulating points per constructor and recording
      // the resulting position after each.
      const cumulativePoints = new Map<string, number>()
      const cumulativeWins = new Map<string, number>()
      const positionsByConstructor = new Map<
        string,
        { lap: number; position: number }[]
      >()

      for (const round of rounds) {
        const bucket = byRound.get(round)!
        for (const r of [...bucket.sprint, ...bucket.race]) {
          if (r.position == null) continue
          const cId = r.vizf1_drivers?.constructor_id
          if (!cId) continue
          const isRace = r.vizf1_sessions.session_type === 'race'
          const table = isRace ? RACE_POINTS : SPRINT_POINTS
          const pts = table[r.position] ?? 0
          cumulativePoints.set(cId, (cumulativePoints.get(cId) ?? 0) + pts)
          if (isRace && r.position === 1) {
            cumulativeWins.set(cId, (cumulativeWins.get(cId) ?? 0) + 1)
          }
        }
        const ranked = [...cumulativePoints.entries()].sort(([aId, aPts], [bId, bPts]) => {
          if (bPts !== aPts) return bPts - aPts
          return (cumulativeWins.get(bId) ?? 0) - (cumulativeWins.get(aId) ?? 0)
        })
        ranked.forEach(([cId], idx) => {
          const list = positionsByConstructor.get(cId) ?? []
          list.push({ lap: round, position: idx + 1 })
          positionsByConstructor.set(cId, list)
        })
      }

      const orderedIds = [...cumulativePoints.entries()]
        .sort(([aId, aPts], [bId, bPts]) => {
          if (bPts !== aPts) return bPts - aPts
          return (cumulativeWins.get(bId) ?? 0) - (cumulativeWins.get(aId) ?? 0)
        })
        .map(([cId]) => cId)
      const include = new Set(orderedIds.slice(0, topN))
      for (const id of forceInclude) include.add(id)
      const finalOrder = orderedIds.filter((id) => include.has(id))

      const lanes: DriverLane[] = finalOrder
        .map((cId): DriverLane | null => {
          const info = constructorInfo.get(cId)
          if (!info) return null
          return {
            driverId: cId, // carries constructor_id; see ConstructorTimeline doc above
            driverCode: info.abbr,
            driverName: info.name,
            color: info.color ?? '#9ca3af',
            points: positionsByConstructor.get(cId) ?? [],
          }
        })
        .filter((l): l is DriverLane => l !== null && l.points.length > 0)

      return { rounds, lanes }
    },
  })
}
