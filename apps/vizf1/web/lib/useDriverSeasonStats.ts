'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

// Mirrors the points tables in useStandings.ts. OpenF1 doesn't expose points
// for every row, so we recompute from finishing positions and fall back to
// the DB `points` column when present. Fastest-lap +1 isn't tracked anywhere
// in the ingest, so per-race totals can be off by at most 1.
const RACE_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
}
const SPRINT_POINTS: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1,
}

export type GpResultRow = {
  round: number
  raceName: string
  country: string
  date: string
  /** Constructor the driver raced for at this round (may differ across season for mid-season swaps). */
  constructorName: string
  /** Numeric finishing position, or null when DNF/DNS/DSQ — surface `status` in that case. */
  position: number | null
  status: string | null
  points: number
}

export type DriverSeasonStats = {
  season: string
  /** Sum of race + sprint points across the season. */
  seasonPoints: number
  gp: {
    races: number
    points: number
    wins: number
    podiums: number
    poles: number
    top10s: number
    /** Fastest-lap counts are not in the ingest — surface as null so the UI can render `—`. */
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
  rows: GpResultRow[]
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
    vizf1_constructors: { name: string } | null
  } | null
}

function isDnf(status: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  // OpenF1 / Ergast surface DNF as a variety of strings — match any retirement
  // indicator. Anything that isn't a finishing-position is treated as a DNF
  // for the season counter; the table row shows the raw status string.
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

export function useDriverSeasonStats(driverId: string, season?: string) {
  const year = season ?? String(new Date().getFullYear())
  return useQuery({
    enabled: !!driverId,
    queryKey: ['vizf1', 'driver-season-stats', driverId, year],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DriverSeasonStats> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('vizf1_session_results')
        .select(
          'position, status, points, driver_id, vizf1_sessions!inner(session_type, vizf1_races!inner(season, round, race_name, date, vizf1_circuits(country))), vizf1_drivers!inner(vizf1_constructors(name))',
        )
        .eq('driver_id', driverId)
        .in('vizf1_sessions.session_type', ['race', 'sprint', 'quali', 'sprint_quali'])
        .eq('vizf1_sessions.vizf1_races.season', year)
      if (error) throw error

      const rows = (data ?? []) as unknown as DbRow[]

      const gp = { races: 0, points: 0, wins: 0, podiums: 0, poles: 0, top10s: 0, dnfs: 0 }
      const sprint = { races: 0, points: 0, wins: 0, podiums: 0, poles: 0, top10s: 0 }
      // Keyed by round so we collapse multiple session_results per weekend into
      // one table row reflecting the race result (sprints/qualis only feed the
      // counters above).
      const raceRows = new Map<number, GpResultRow>()

      for (const r of rows) {
        const s = r.vizf1_sessions
        const race = s?.vizf1_races
        if (!s || !race) continue
        const pts = pointsFor(s.session_type, r.position, r.points)
        const round = race.round

        if (s.session_type === 'race') {
          gp.races += 1
          gp.points += pts
          if (r.position === 1) gp.wins += 1
          if (r.position != null && r.position <= 3) gp.podiums += 1
          if (r.position != null && r.position <= 10) gp.top10s += 1
          if (isDnf(r.status) || (r.position == null && r.status)) gp.dnfs += 1
          raceRows.set(round, {
            round,
            raceName: race.race_name,
            country: race.vizf1_circuits?.country ?? race.race_name,
            date: race.date,
            constructorName: r.vizf1_drivers?.vizf1_constructors?.name ?? '',
            position: r.position,
            status: r.status,
            points: pts,
          })
        } else if (s.session_type === 'sprint') {
          sprint.races += 1
          sprint.points += pts
          if (r.position === 1) sprint.wins += 1
          if (r.position != null && r.position <= 3) sprint.podiums += 1
          if (r.position != null && r.position <= 10) sprint.top10s += 1
        } else if (s.session_type === 'quali') {
          if (r.position === 1) gp.poles += 1
        } else if (s.session_type === 'sprint_quali') {
          if (r.position === 1) sprint.poles += 1
        }
      }

      const sortedRows = [...raceRows.values()].sort((a, b) => a.round - b.round)

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
