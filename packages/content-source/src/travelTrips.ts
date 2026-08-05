/**
 * DB helpers for the `travel_trips` table (migration 073) — the travel app's
 * per-trip password gate. Mirrors `demos.ts` minus the stories(slug) FK:
 * travel story content is filesystem-mode, so a trip row is keyed only by its
 * story slug. All callers run server-side with the service-role client.
 */

import { createServiceClient } from './supabase'

export type TravelTripStatus = 'draft' | 'live' | 'archived'

export interface TravelTripRow {
  slug: string
  name: string
  password_hash: string
  status: TravelTripStatus
  updated_at: string
  created_at: string
}

const SAFE_TRIP_SLUG = /^[a-z0-9][a-z0-9_-]{1,63}$/

export function isValidTripSlug(s: string): boolean {
  return typeof s === 'string' && SAFE_TRIP_SLUG.test(s)
}

export async function getTravelTrip(slug: string): Promise<TravelTripRow | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('travel_trips')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`getTravelTrip: ${error.message}`)
  return (data as TravelTripRow | null) ?? null
}

export async function listTravelTrips(): Promise<
  Pick<TravelTripRow, 'slug' | 'name' | 'status' | 'updated_at'>[]
> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('travel_trips')
    .select('slug, name, status, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listTravelTrips: ${error.message}`)
  return (data ?? []) as Pick<TravelTripRow, 'slug' | 'name' | 'status' | 'updated_at'>[]
}

export interface UpsertTravelTripInput {
  slug: string
  name: string
  password_hash: string
  status?: TravelTripStatus
}

export async function upsertTravelTrip(input: UpsertTravelTripInput): Promise<TravelTripRow> {
  if (!isValidTripSlug(input.slug)) {
    throw new Error(`upsertTravelTrip: bad slug "${input.slug}"`)
  }
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('travel_trips')
    .upsert(
      {
        slug: input.slug,
        name: input.name,
        password_hash: input.password_hash,
        ...(input.status ? { status: input.status } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' }
    )
    .select('*')
    .single()
  if (error) throw new Error(`upsertTravelTrip: ${error.message}`)
  return data as TravelTripRow
}
