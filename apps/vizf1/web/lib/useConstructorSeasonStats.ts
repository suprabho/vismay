'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

// Same points tables as useStandings / useDriverSeasonStats — kept duplicated
// rather than abstracted so each query stays self-contained.
const RACE_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
}
const SPRINT_POINTS: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1,
}

export type ConstructorDriverResult = {
  driverId: string
  driverName: string
  driverCode: string | null
  position: number | null
  status: string | null
  points: number
}

export type ConstructorGpRow = {
  round: number
  raceName: string
  country: string
  date: string
  /** Both (or more, with mid-season swaps) drivers' results for this weekend. */
  drivers: ConstructorDriverResult[]
  /** Sum of race + sprint points across drivers for this round. */
  totalPoints: number
}

export type ConstructorSeasonStats = {
  season: string
  /** Sum of race + sprint points across the season. */
  seasonPoints: number
  gp: {
    races: number
    points: number
    /** Distinct race rounds where any of the constructor's drivers finished P1. */
    wins: number
    /** Count of podium finishes across drivers (1-2 finish = 2). */
    podiums: number
    /** Distinct race rounds where any driver took pole in quali. */
    poles: number
    top10s: number
    /** Not in ingest — surface null so UI renders "—". */
    fastestLaps: number | null
    dnfs: number
  }
  sprint: {
    races: number
    points: number
    wins: number
    podiums: number
    poles: number
    top10s: number
  }
  rows: ConstructorGpRow[]
}

type DbRow = {
  position: number | null
  status: string | null
  points: number | null
  driver_id: string
  vizf1_sessions: {
    session_type: 'race' | 'sprint' | 'quali' | 'sprint_quali'
    vizf1_races: {
      season: string
      round: number
      race_name: string
      date: string
      vizf1_circuits: { country: string | null } | null
    } | null
  } | null
  vizf1_drivers: {
    driver_id: string
    given_name: string
    family_name: string
    code: string | null
    constructor_id: string | null
  } | null
}

function isDnf(status: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return (
    s.includes('dnf') ||
    s.includes('retired') ||
    s.includes('accident') ||
    s.includes('collision') ||
    s.includes('engine') ||
    s.includes('mechanical') ||
    s.includes('did not finish')
  )
}

function pointsFor(
  sessionType: 'race' | 'sprint' | 'quali' | 'sprint_quali',
  position: number | null,
  dbPoints: number | null,
): number {
  if (sessionType === 'quali' || sessionType === 'sprint_quali') return 0
  if (dbPoints != null) return dbPoints
  if (position == null) return 0
  const table = sessionType === 'sprint' ? SPRINT_POINTS : RACE_POINTS
  return table[position] ?? 0
}

export function useConstructorSeasonStats(constructorId: string, season?: string) {
  const year = season ?? String(new Date().getFullYear())
  return useQuery({
    enabled: !!constructorId,
    queryKey: ['vizf1', 'constructor-season-stats', constructorId, year],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConstructorSeasonStats> => {
      const sb = supabaseBrowser()
      // Filter on the joined drivers row by constructor_id. Supabase supports
      // dotted-path filters on inner-joined relations.
      const { data, error } = await sb
        .from('vizf1_session_results')
        .select(
          'position, status, points, driver_id, vizf1_sessions!inner(session_type, vizf1_races!inner(season, round, race_name, date, vizf1_circuits(country))), vizf1_drivers!inner(driver_id, given_name, family_name, code, constructor_id)',
        )
        .eq('vizf1_drivers.constructor_id', constructorId)
        .in('vizf1_sessions.session_type', ['race', 'sprint', 'quali', 'sprint_quali'])
        .eq('vizf1_sessions.vizf1_races.season', year)
      if (error) throw error

      const rows = (data ?? []) as unknown as DbRow[]

      const gp = { races: 0, points: 0, wins: 0, podiums: 0, poles: 0, top10s: 0, dnfs: 0 }
      const sprint = { races: 0, points: 0, wins: 0, podiums: 0, poles: 0, top10s: 0 }

      // Per-round aggregation for the table. Wins/poles are counted per-round
      // (constructor wins a race once even if both cars podium) so we track
      // round-level flags in addition to the per-row accumulation.
      const byRound = new Map<number, ConstructorGpRow>()
      const raceRoundsSeen = new Set<number>()
      const sprintRoundsSeen = new Set<number>()
      const raceWinRounds = new Set<number>()
      const sprintWinRounds = new Set<number>()
      const poleRounds = new Set<number>()
      const sprintPoleRounds = new Set<number>()

      for (const r of rows) {
        const s = r.vizf1_sessions
        const race = s?.vizf1_races
        const d = r.vizf1_drivers
        if (!s || !race || !d) continue
        const round = race.round
        const pts = pointsFor(s.session_type, r.position, r.points)

        if (s.session_type === 'race') {
          raceRoundsSeen.add(round)
          gp.points += pts
          if (r.position === 1) raceWinRounds.add(round)
          if (r.position != null && r.position <= 3) gp.podiums += 1
          if (r.position != null && r.position <= 10) gp.top10s += 1
          if (isDnf(r.status) || (r.position == null && r.status)) gp.dnfs += 1

          const existing = byRound.get(round) ?? {
            round,
            raceName: race.race_name,
            country: race.vizf1_circuits?.country ?? race.race_name,
            date: race.date,
            drivers: [],
            totalPoints: 0,
          }
          existing.drivers.push({
            driverId: d.driver_id,
            driverName: `${d.given_name} ${d.family_name}`,
            driverCode: d.code,
            position: r.position,
            status: r.status,
            points: pts,
          })
          existing.totalPoints += pts
          byRound.set(round, existing)
        } else if (s.session_type === 'sprint') {
          sprintRoundsSeen.add(round)
          sprint.points += pts
          if (r.position === 1) sprintWinRounds.add(round)
          if (r.position != null && r.position <= 3) sprint.podiums += 1
          if (r.position != null && r.position <= 10) sprint.top10s += 1
          // Sprint points also accrue to the constructor's per-round total in
          // the table, but the per-driver sprint row isn't shown there — the
          // table only lists the GP race result, matching the driver-page mock.
          const existing = byRound.get(round)
          if (existing) existing.totalPoints += pts
        } else if (s.session_type === 'quali') {
          if (r.position === 1) poleRounds.add(round)
        } else if (s.session_type === 'sprint_quali') {
          if (r.position === 1) sprintPoleRounds.add(round)
        }
      }

      gp.races = raceRoundsSeen.size
      gp.wins = raceWinRounds.size
      gp.poles = poleRounds.size
      sprint.races = sprintRoundsSeen.size
      sprint.wins = sprintWinRounds.size
      sprint.poles = sprintPoleRounds.size

      // Sort each round's drivers by position so the table renders the better
      // result first (DNFs/unclassified push to the end).
      const sortedRows = [...byRound.values()]
        .map((row) => ({
          ...row,
          drivers: [...row.drivers].sort(
            (a, b) => (a.position ?? 999) - (b.position ?? 999),
          ),
        }))
        .sort((a, b) => a.round - b.round)

      return {
        season: year,
        seasonPoints: gp.points + sprint.points,
        gp: { ...gp, fastestLaps: null },
        sprint,
        rows: sortedRows,
      }
    },
  })
}
