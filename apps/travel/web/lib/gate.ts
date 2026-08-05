import { notFound, redirect } from 'next/navigation'
import { isDemoAuthed } from '@vismay/content-source/demoAuth'
import { getTravelTrip, isValidTripSlug } from '@vismay/content-source/travelTrips'

/**
 * The per-trip password gate, called at the top of both trip views
 * (`/t/[slug]` journey map and `/t/[slug]/story` scrapbook) so one cookie
 * covers both.
 *
 * Same posture as vizmaya's /demo gate: missing trip, archived trip, and
 * wrong/absent cookie all take the same redirect to the login page — no
 * slug-enumeration channel. The auth route (`/api/trips/[slug]/auth`)
 * returns the same generic 401 for unknown slugs and wrong passwords.
 *
 * Dev convenience: without Supabase credentials there is no travel_trips
 * table to check, so the gate fails OPEN in development and CLOSED in
 * production — mirroring admin-core's signed middleware.
 */
export async function requireTripAuth(slug: string): Promise<void> {
  if (!isValidTripSlug(slug)) notFound()

  const hasEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!hasEnv) {
    if (process.env.NODE_ENV !== 'production') return
    redirect(`/t/${slug}/login`)
  }

  let authed = false
  try {
    const trip = await getTravelTrip(slug)
    authed =
      !!trip && trip.status !== 'archived' && (await isDemoAuthed(slug, trip.password_hash))
  } catch {
    authed = false
  }
  if (!authed) redirect(`/t/${slug}/login`)
}
