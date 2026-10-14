import { notFound, redirect } from 'next/navigation'
import { isDemoAuthed } from '@vismay/content-source/demoAuth'
import { getTravelTrip, isValidTripSlug } from '@vismay/content-source/travelTrips'

/**
 * The per-trip password gate, called at the top of both trip views
 * (`/t/[slug]` journey map and `/t/[slug]/story` scrapbook) and by the trip's
 * HTML stories (`/s/[slug]`, via isTripAuthed) so one cookie covers them all.
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
  if (!(await isTripAuthed(slug))) redirect(`/t/${slug}/login`)
}

/**
 * The gate's check without the redirect, for route handlers (the HTML story
 * route, `app/s/[slug]`) that build their own response. The slug must
 * already be a valid trip slug.
 */
export async function isTripAuthed(slug: string): Promise<boolean> {
  const hasEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!hasEnv) return process.env.NODE_ENV !== 'production'

  try {
    const trip = await getTravelTrip(slug)
    return !!trip && trip.status !== 'archived' && (await isDemoAuthed(slug, trip.password_hash))
  } catch {
    return false
  }
}

/**
 * Where the login page may send a visitor back to after the password: one
 * of this trip's own pages or an HTML story (`/s/<slug>`, whose route checks
 * its trip again). Anything else, including other origins, is dropped.
 */
export function safeReturnPath(next: string | null | undefined, slug: string): string | null {
  if (!next) return null
  if (/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next)) return next
  if (next === `/t/${slug}` || next === `/t/${slug}/story`) return next
  return null
}
