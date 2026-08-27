/**
 * DB helpers for the `travel_trips` table (migration 073) — the travel app's
 * per-trip password gate, plus (migration 076) the mirrored trip itinerary so
 * surfaces without the travel app's filesystem (admin, the shared render
 * surface) can read stops/coordinates. All callers run server-side with the
 * service-role client.
 *
 * The itinerary types below are the canonical `TripData` shape — the travel
 * app's `lib/trips.ts` re-exports them and its fs `.trip.yaml` reader
 * normalizes into the same shape via `buildTripData`.
 *
 * Coordinates throughout are **[lng, lat]** (Mapbox order).
 */

import { createServiceClient } from './supabase'

export type TravelTripStatus = 'draft' | 'live' | 'archived'

export interface StopMedia {
  file: string
  /** `assets://<slug>/<file>` — resolve client-side with resolveAssetUrl(). */
  ref: string
  kind: 'image' | 'video'
  caption?: string
  takenAt?: string
}

export interface TripStop {
  slug: string
  time: string
  emoji: string
  name: string
  desc: string
  tip?: string
  coordinates: [number, number] | null
  tag?: string
  suggestedBy?: string[]
  media: StopMedia[]
}

export interface TripStay {
  name: string
  coordinates: [number, number]
}

export interface TripDay {
  n: number | null
  heading: string
  title: string
  label?: string
  subtitle?: string
  color: string
  center: [number, number] | null
  zoom: number | null
  stay?: TripStay
  notes?: string
  stops: TripStop[]
  /** Media attached to the day but not to a specific stop. */
  media: StopMedia[]
}

export interface TripAirport {
  name: string
  code: string
  coordinates: [number, number]
  date?: string
  time?: string
  flight?: string
  kind: 'arrival' | 'departure'
  day: number | null
}

export interface TripData {
  slug: string
  id: string
  city: string
  subtitle?: string
  emoji?: string
  highlights?: string
  startDate?: string
  endDate?: string
  days: TripDay[]
  airports: TripAirport[]
}

/**
 * Normalize a raw parsed itinerary (from `.trip.yaml` or the `itinerary`
 * jsonb column) into `TripData`. Media arrays start empty — media joins from
 * `travel_trip_media` (or the yaml manifest) at read time.
 */
export function buildTripData(slug: string, raw: Record<string, unknown>): TripData {
  const rawDays = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : []
  const days: TripDay[] = rawDays.map((d) => ({
    n: (d.n as number | null) ?? null,
    heading: String(d.heading ?? ''),
    title: String(d.title ?? d.heading ?? ''),
    label: d.label as string | undefined,
    subtitle: d.subtitle as string | undefined,
    color: String(d.color ?? '#8a8172'),
    center: (d.center as [number, number] | null) ?? null,
    zoom: (d.zoom as number | null) ?? null,
    stay: d.stay as TripStay | undefined,
    notes: d.notes as string | undefined,
    stops: (Array.isArray(d.stops) ? (d.stops as Record<string, unknown>[]) : []).map(
      (s) => ({
        slug: String(s.slug ?? ''),
        time: String(s.time ?? ''),
        emoji: String(s.emoji ?? ''),
        name: String(s.name ?? ''),
        desc: String(s.desc ?? ''),
        tip: s.tip as string | undefined,
        coordinates: (s.coordinates as [number, number] | null) ?? null,
        tag: s.tag as string | undefined,
        suggestedBy: s.suggestedBy as string[] | undefined,
        media: [],
      })
    ),
    media: [],
  }))

  return {
    slug,
    id: String(raw.id ?? slug),
    city: String(raw.city ?? slug),
    subtitle: raw.subtitle as string | undefined,
    emoji: raw.emoji as string | undefined,
    highlights: raw.highlights as string | undefined,
    startDate: raw.startDate as string | undefined,
    endDate: raw.endDate as string | undefined,
    days,
    airports: Array.isArray(raw.airports) ? (raw.airports as TripAirport[]) : [],
  }
}

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

/**
 * The mirrored itinerary (migration 076). Null when the trip row is missing,
 * the column hasn't been synced, or the migration isn't applied yet — callers
 * must treat null as "no itinerary available" and degrade.
 */
export async function getTripItinerary(slug: string): Promise<TripData | null> {
  if (!isValidTripSlug(slug)) return null
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('travel_trips')
    .select('itinerary')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`getTripItinerary: ${error.message}`)
  const raw = (data?.itinerary as Record<string, unknown> | null) ?? null
  if (!raw) return null
  return buildTripData(slug, raw)
}

/**
 * Sync the itinerary mirror. Updates the existing gate row without touching
 * name/password/status; when no row exists yet (import runs before
 * `travel:set-password`), inserts a locked placeholder row (`password_hash`
 * empty ⇒ no cookie ever verifies, so the gate fails closed until a real
 * password is set).
 */
export async function upsertTripItinerary(slug: string, itinerary: TripData): Promise<void> {
  if (!isValidTripSlug(slug)) throw new Error(`upsertTripItinerary: bad slug "${slug}"`)
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('travel_trips')
    .update({ itinerary, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select('slug')
  if (error) throw new Error(`upsertTripItinerary: ${error.message}`)
  if ((data ?? []).length > 0) return
  const { error: insertError } = await sb.from('travel_trips').insert({
    slug,
    name: itinerary.city || slug,
    password_hash: '',
    itinerary,
  })
  if (insertError) throw new Error(`upsertTripItinerary insert: ${insertError.message}`)
}
