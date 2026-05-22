'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

export type FollowedDriver = {
  id: string
  name: string
  code: string
  headshotUrl: string | null
  primaryColor: string | null
}

export type FollowedConstructor = {
  id: string
  name: string
  primaryColor: string | null
}

export type FollowedEntities = {
  drivers: FollowedDriver[]
  constructors: FollowedConstructor[]
}

// TODO(vizf1): replace with auth-backed follows once we port AuthProvider +
// onboarding from footshort. For now we just hydrate the static list with DB
// metadata so portraits and team colours appear once the worker has run.
//
// Look up drivers by `code` (VER/NOR/LEC/HAM/PIA) and constructors by `name`
// rather than by primary key, because the worker derives driver_id from
// OpenF1's `first_name`/`last_name` (e.g. `lando_norris`) and constructor_id
// from `team_name` (e.g. `red_bull_racing`) — formats that have shifted
// historically and don't match the Jolpica-style slugs the SQL comments imply.
// `code` and `name` are stable across sources.
const STATIC_DRIVER_CODES = ['VER', 'NOR', 'LEC', 'HAM', 'PIA'] as const
const STATIC_CONSTRUCTOR_NAMES = ['McLaren', 'Red Bull Racing', 'Ferrari', 'Mercedes'] as const

const STATIC_FALLBACK: FollowedEntities = {
  drivers: [
    { id: 'max_verstappen', name: 'Max Verstappen', code: 'VER', headshotUrl: null, primaryColor: null },
    { id: 'lando_norris', name: 'Lando Norris', code: 'NOR', headshotUrl: null, primaryColor: null },
    { id: 'charles_leclerc', name: 'Charles Leclerc', code: 'LEC', headshotUrl: null, primaryColor: null },
    { id: 'lewis_hamilton', name: 'Lewis Hamilton', code: 'HAM', headshotUrl: null, primaryColor: null },
    { id: 'oscar_piastri', name: 'Oscar Piastri', code: 'PIA', headshotUrl: null, primaryColor: null },
  ],
  constructors: [
    { id: 'mclaren', name: 'McLaren', primaryColor: null },
    { id: 'red_bull_racing', name: 'Red Bull Racing', primaryColor: null },
    { id: 'ferrari', name: 'Ferrari', primaryColor: null },
    { id: 'mercedes', name: 'Mercedes', primaryColor: null },
  ],
}

type DriverDbRow = {
  driver_id: string
  given_name: string
  family_name: string
  code: string | null
  headshot_url: string | null
  primary_color: string | null
}
type ConstructorDbRow = { constructor_id: string; name: string; primary_color: string | null }

export function useFollowedEntities(): FollowedEntities {
  const q = useQuery({
    queryKey: ['vizf1', 'followed', 'static', 'v2'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<FollowedEntities> => {
      const sb = supabaseBrowser()
      const [drivers, constructors] = await Promise.all([
        sb
          .from('vizf1_drivers')
          .select('driver_id, given_name, family_name, code, headshot_url, primary_color')
          .in('code', STATIC_DRIVER_CODES as unknown as string[]),
        sb
          .from('vizf1_constructors')
          .select('constructor_id, name, primary_color')
          .in('name', STATIC_CONSTRUCTOR_NAMES as unknown as string[]),
      ])
      const dByCode = new Map(
        ((drivers.data ?? []) as DriverDbRow[])
          .filter((r) => r.code)
          .map((r) => [r.code as string, r]),
      )
      const cByName = new Map(
        ((constructors.data ?? []) as ConstructorDbRow[]).map((r) => [r.name, r]),
      )
      return {
        drivers: STATIC_FALLBACK.drivers.map((s) => {
          const r = dByCode.get(s.code)
          return r
            ? {
                id: r.driver_id,
                name: `${r.given_name} ${r.family_name}`,
                code: r.code ?? s.code,
                headshotUrl: r.headshot_url,
                primaryColor: r.primary_color,
              }
            : s
        }),
        constructors: STATIC_FALLBACK.constructors.map((s) => {
          const r = cByName.get(s.name)
          return r ? { id: r.constructor_id, name: r.name, primaryColor: r.primary_color } : s
        }),
      }
    },
  })
  return q.data ?? STATIC_FALLBACK
}
