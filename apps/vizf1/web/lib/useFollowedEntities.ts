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
const STATIC_DRIVER_IDS = ['max_verstappen', 'norris', 'leclerc', 'hamilton', 'piastri'] as const
const STATIC_CONSTRUCTOR_IDS = ['mclaren', 'red_bull', 'ferrari', 'mercedes'] as const

const STATIC_FALLBACK: FollowedEntities = {
  drivers: [
    { id: 'max_verstappen', name: 'Max Verstappen', code: 'VER', headshotUrl: null, primaryColor: null },
    { id: 'norris', name: 'Lando Norris', code: 'NOR', headshotUrl: null, primaryColor: null },
    { id: 'leclerc', name: 'Charles Leclerc', code: 'LEC', headshotUrl: null, primaryColor: null },
    { id: 'hamilton', name: 'Lewis Hamilton', code: 'HAM', headshotUrl: null, primaryColor: null },
    { id: 'piastri', name: 'Oscar Piastri', code: 'PIA', headshotUrl: null, primaryColor: null },
  ],
  constructors: [
    { id: 'mclaren', name: 'McLaren', primaryColor: null },
    { id: 'red_bull', name: 'Red Bull', primaryColor: null },
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
    queryKey: ['vizf1', 'followed', 'static'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<FollowedEntities> => {
      const sb = supabaseBrowser()
      const [drivers, constructors] = await Promise.all([
        sb
          .from('drivers')
          .select('driver_id, given_name, family_name, code, headshot_url, primary_color')
          .in('driver_id', STATIC_DRIVER_IDS as unknown as string[]),
        sb
          .from('constructors')
          .select('constructor_id, name, primary_color')
          .in('constructor_id', STATIC_CONSTRUCTOR_IDS as unknown as string[]),
      ])
      const dById = new Map(((drivers.data ?? []) as DriverDbRow[]).map((r) => [r.driver_id, r]))
      const cById = new Map(
        ((constructors.data ?? []) as ConstructorDbRow[]).map((r) => [r.constructor_id, r]),
      )
      return {
        drivers: STATIC_FALLBACK.drivers.map((s) => {
          const r = dById.get(s.id)
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
          const r = cById.get(s.id)
          return r ? { id: r.constructor_id, name: r.name, primaryColor: r.primary_color } : s
        }),
      }
    },
  })
  return q.data ?? STATIC_FALLBACK
}
