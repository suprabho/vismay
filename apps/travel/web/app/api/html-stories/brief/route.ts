import { handleHtmlStoryBriefRequest } from '@vismay/html-stories/briefApi'
import { readTripWithMedia } from '@/lib/trips'

/**
 * The travel agent brief as plain markdown: "read <site>/api/html-stories/brief
 * and write the story of day 3". `?trip=<slug>&day=<n>&prompt=…` (with the
 * publish token as a bearer: a trip is private) appends the trip context, the
 * itinerary and the curated photos' URLs, read the way the journey map reads
 * them (curated media from the DB, the git files as fallback). See briefApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleHtmlStoryBriefRequest(req, 'travel', { loadTrip: readTripWithMedia })
}
