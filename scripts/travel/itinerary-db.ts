/**
 * Shared itinerary→DB upsert for the travel scripts (no CLI — imported by
 * sync-trip-db.ts and import-pro-trip.ts). Mirrors
 * `@vismay/content-source/travelTrips` `upsertTripItinerary` semantics with
 * the scripts' self-contained raw client: update the existing gate row
 * without touching name/password/status; when no row exists yet (import runs
 * before `travel:set-password`), insert a locked placeholder (`password_hash`
 * empty ⇒ the gate fails closed until a real password is set).
 */

import { createClient } from '@supabase/supabase-js'

export interface ItineraryDoc {
  city?: string
  [key: string]: unknown
}

export async function upsertItineraryDb(
  slug: string,
  itinerary: ItineraryDoc
): Promise<'updated' | 'inserted'> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env.')
  const supabase = createClient(url, key)

  const { data, error } = await supabase
    .from('travel_trips')
    .update({ itinerary, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select('slug')
  if (error) throw new Error(`travel_trips update (is migration 076 applied?): ${error.message}`)
  if ((data ?? []).length > 0) return 'updated'

  const { error: insertError } = await supabase.from('travel_trips').insert({
    slug,
    name: itinerary.city || slug,
    password_hash: '',
    itinerary,
  })
  if (insertError) throw new Error(`travel_trips insert: ${insertError.message}`)
  return 'inserted'
}

export function hasSupabaseEnv(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}
