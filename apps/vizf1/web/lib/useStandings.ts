'use client'

import { useQuery } from '@tanstack/react-query'
import type {
  ConstructorStandingRow,
  DriverStandingRow,
} from '@vismay/f1-viz/types'
import { supabaseBrowser } from './supabaseBrowser'

// Standard F1 points tables. OpenF1 doesn't expose points, so we recompute
// from finishing positions. Fastest-lap +1 isn't tracked (the ingest doesn't
// know which driver set the fastest lap of each race), so totals can be off
// by at most 1 per race per leader. Good enough for ordering.
const RACE_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
}
const SPRINT_POINTS: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1,
}

type RawRow = {
  position: number | null
  session_type: 'race' | 'sprint'
  driver_id: string
  drivers: {
    given_name: string
    family_name: string
    code: string | null
    headshot_url: string | null
    primary_color: string | null
    constructor_id: string | null
    constructors: {
      name: string
      nationality: string | null
      primary_color: string | null
      logo_url: string | null
    } | null
  } | null
}

type StandingsBundle = {
  drivers: DriverStandingRow[]
  constructors: ConstructorStandingRow[]
}

async function fetchStandings(): Promise<StandingsBundle> {
  const sb = supabaseBrowser()
  const year = String(new Date().getFullYear())

  // One round-trip: every race+sprint session_results row in the current season,
  // with driver + constructor metadata joined in.
  const { data, error } = await sb
    .from('vizf1_session_results')
    .select(
      'position, driver_id, vizf1_sessions!inner(session_type, vizf1_races!inner(season)), drivers:vizf1_drivers!inner(given_name, family_name, code, headshot_url, primary_color, constructor_id, constructors:vizf1_constructors(name, nationality, primary_color, logo_url))',
    )
    .in('vizf1_sessions.session_type', ['race', 'sprint'])
    .eq('vizf1_sessions.vizf1_races.season', year)
  if (error) throw error

  // Supabase's row shape with the inner-joined `vizf1_sessions` field needs flattening
  // to surface session_type alongside the result row.
  const rows = ((data ?? []) as unknown as Array<
    RawRow & { vizf1_sessions: { session_type: 'race' | 'sprint' } }
  >).map((r) => ({
    position: r.position,
    session_type: r.vizf1_sessions.session_type,
    driver_id: r.driver_id,
    drivers: r.drivers,
  } as RawRow))

  type DriverAgg = {
    driverId: string
    driverCode: string | null
    driverName: string
    constructorId: string
    constructorName: string
    constructorColor: string | null
    headshotUrl: string | null
    points: number
    wins: number
  }
  type ConstructorAgg = {
    constructorId: string
    constructorName: string
    nationality: string | null
    primaryColor: string | null
    logoUrl: string | null
    points: number
    wins: number
  }

  const driverMap = new Map<string, DriverAgg>()
  const constructorMap = new Map<string, ConstructorAgg>()

  for (const r of rows) {
    const d = r.drivers
    if (!d || r.position == null) continue
    const table = r.session_type === 'sprint' ? SPRINT_POINTS : RACE_POINTS
    const pts = table[r.position] ?? 0
    const isRaceWin = r.session_type === 'race' && r.position === 1
    const constructorId = d.constructor_id ?? 'unknown'
    const constructorName = d.constructors?.name ?? constructorId

    const existing = driverMap.get(r.driver_id) ?? {
      driverId: r.driver_id,
      driverCode: d.code,
      driverName: `${d.given_name} ${d.family_name}`,
      constructorId,
      constructorName,
      constructorColor: d.primary_color,
      headshotUrl: d.headshot_url,
      points: 0,
      wins: 0,
    }
    existing.points += pts
    if (isRaceWin) existing.wins += 1
    driverMap.set(r.driver_id, existing)

    const existingC = constructorMap.get(constructorId) ?? {
      constructorId,
      constructorName,
      nationality: d.constructors?.nationality ?? null,
      // Per-driver `primary_color` is the closest match to OpenF1's team
      // colour. Fall back to the constructor-table value if the driver row
      // is missing it.
      primaryColor: d.primary_color ?? d.constructors?.primary_color ?? null,
      logoUrl: d.constructors?.logo_url ?? null,
      points: 0,
      wins: 0,
    }
    existingC.points += pts
    if (isRaceWin) existingC.wins += 1
    constructorMap.set(constructorId, existingC)
  }

  const driverSorted = [...driverMap.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins,
  )
  const constructorSorted = [...constructorMap.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins,
  )

  return {
    drivers: driverSorted.map((d, i) => ({ position: i + 1, ...d })),
    constructors: constructorSorted.map((c, i) => ({ position: i + 1, ...c })),
  }
}

function useStandings() {
  return useQuery({
    queryKey: ['vizf1', 'standings', 'current'],
    queryFn: fetchStandings,
    staleTime: 5 * 60_000,
  })
}

export function useDriverStandings() {
  const q = useStandings()
  return { ...q, data: q.data?.drivers }
}

export function useConstructorStandings() {
  const q = useStandings()
  return { ...q, data: q.data?.constructors }
}
