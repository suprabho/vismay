'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

// Selectable entities for the preferences flow. Public-read, so they go through
// the anonymous `supabaseBrowser` client (not the auth client).

export type CatalogDriver = {
  id: string
  name: string
  code: string | null
  headshotUrl: string | null
  primaryColor: string | null
}

export type CatalogConstructor = {
  id: string
  name: string
  logoUrl: string | null
  primaryColor: string | null
}

type DriverRow = {
  driver_id: string
  given_name: string
  family_name: string
  code: string | null
  headshot_url: string | null
  primary_color: string | null
}

type ConstructorRow = {
  constructor_id: string
  name: string
  logo_url: string | null
  primary_color: string | null
}

export function useAllDrivers() {
  return useQuery({
    queryKey: ['vizf1', 'catalog', 'drivers'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<CatalogDriver[]> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('vizf1_drivers')
        .select('driver_id, given_name, family_name, code, headshot_url, primary_color')
        .order('family_name')
      if (error) throw error
      return ((data ?? []) as DriverRow[]).map((r) => ({
        id: r.driver_id,
        name: `${r.given_name} ${r.family_name}`,
        code: r.code,
        headshotUrl: r.headshot_url,
        primaryColor: r.primary_color,
      }))
    },
  })
}

export function useAllConstructors() {
  return useQuery({
    queryKey: ['vizf1', 'catalog', 'constructors'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<CatalogConstructor[]> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('vizf1_constructors')
        .select('constructor_id, name, logo_url, primary_color')
        .order('name')
      if (error) throw error
      return ((data ?? []) as ConstructorRow[]).map((r) => ({
        id: r.constructor_id,
        name: r.name,
        logoUrl: r.logo_url,
        primaryColor: r.primary_color,
      }))
    },
  })
}
