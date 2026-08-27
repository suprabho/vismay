'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'
import { useAuth } from './AuthProvider'
import { useFollows } from './usePreferences'

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
  logoUrl: string | null
}

export type FollowedEntities = {
  drivers: FollowedDriver[]
  constructors: FollowedConstructor[]
}

// When a signed-in user has follows (see the preferences flow in
// app/onboarding + app/following), we hydrate those. Otherwise we fall back to a
// curated static list so logged-out / not-yet-onboarded visitors still see a
// populated "For You" rail.
//
// We look drivers up by `code` (VER/NOR/LEC/HAM/PIA) and constructors by `name`
// for the static fallback because the worker derives driver_id from OpenF1's
// `first_name`/`last_name` and constructor_id from `team_name` — formats that
// have shifted historically. `code` and `name` are stable across sources. The
// auth-backed path stores the actual driver_id/constructor_id, so it looks up by
// primary key directly.
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
    { id: 'mclaren', name: 'McLaren', primaryColor: null, logoUrl: null },
    { id: 'red_bull_racing', name: 'Red Bull Racing', primaryColor: null, logoUrl: null },
    { id: 'ferrari', name: 'Ferrari', primaryColor: null, logoUrl: null },
    { id: 'mercedes', name: 'Mercedes', primaryColor: null, logoUrl: null },
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
type ConstructorDbRow = {
  constructor_id: string
  name: string
  primary_color: string | null
  logo_url: string | null
}

export function useFollowedEntities(): FollowedEntities {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const { data: follows } = useFollows()

  const followedDriverIds = (follows ?? [])
    .filter((f) => f.entity_type === 'driver')
    .map((f) => f.entity_id)
  const followedConstructorIds = (follows ?? [])
    .filter((f) => f.entity_type === 'constructor')
    .map((f) => f.entity_id)
  const hasFollows = followedDriverIds.length > 0 || followedConstructorIds.length > 0

  const q = useQuery({
    queryKey: [
      'vizf1',
      'followed',
      userId,
      hasFollows ? [...followedDriverIds].sort() : 'static',
      hasFollows ? [...followedConstructorIds].sort() : 'static',
    ],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<FollowedEntities> => {
      const sb = supabaseBrowser()

      if (hasFollows) {
        const [drivers, constructors] = await Promise.all([
          followedDriverIds.length
            ? sb
                .from('vizf1_drivers')
                .select('driver_id, given_name, family_name, code, headshot_url, primary_color')
                .in('driver_id', followedDriverIds)
            : Promise.resolve({ data: [] as DriverDbRow[] }),
          followedConstructorIds.length
            ? sb
                .from('vizf1_constructors')
                .select('constructor_id, name, primary_color, logo_url')
                .in('constructor_id', followedConstructorIds)
            : Promise.resolve({ data: [] as ConstructorDbRow[] }),
        ])
        return {
          drivers: ((drivers.data ?? []) as DriverDbRow[]).map((r) => ({
            id: r.driver_id,
            name: `${r.given_name} ${r.family_name}`,
            code: r.code ?? '',
            headshotUrl: r.headshot_url,
            primaryColor: r.primary_color,
          })),
          constructors: ((constructors.data ?? []) as ConstructorDbRow[]).map((r) => ({
            id: r.constructor_id,
            name: r.name,
            primaryColor: r.primary_color,
            logoUrl: r.logo_url,
          })),
        }
      }

      // Logged-out / not-yet-onboarded: hydrate the curated static list.
      const [drivers, constructors] = await Promise.all([
        sb
          .from('vizf1_drivers')
          .select('driver_id, given_name, family_name, code, headshot_url, primary_color')
          .in('code', STATIC_DRIVER_CODES as unknown as string[]),
        sb
          .from('vizf1_constructors')
          .select('constructor_id, name, primary_color, logo_url')
          .in('name', STATIC_CONSTRUCTOR_NAMES as unknown as string[]),
      ])
      const dByCode = new Map(
        ((drivers.data ?? []) as DriverDbRow[]).filter((r) => r.code).map((r) => [r.code as string, r]),
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
          return r
            ? {
                id: r.constructor_id,
                name: r.name,
                primaryColor: r.primary_color,
                logoUrl: r.logo_url,
              }
            : s
        }),
      }
    },
  })
  return q.data ?? STATIC_FALLBACK
}
