/**
 * The travel HTML-story brief with its trip context: the generic brief
 * (./brief) plus, for the trip (or the one day of it) the story is about, the
 * itinerary as it was planned (days, stops, times, coordinates, notes, tips),
 * the stay and the flights, and the trip's curated photos and clips stop by
 * stop with their public URLs, so the agent writes from the real day and
 * links the travellers' own pictures.
 *
 * The itinerary comes from travel_trips.itinerary (migration 076, mirrored by
 * `pnpm travel:sync-trip-db`) and the photos from travel_trip_media's selected
 * rows (migration 074: what the travel app's /curate edits). The travel app
 * passes its own loader instead, which falls back to the git `.trip.yaml` and
 * media manifest the same way its pages do.
 *
 * Server only: it reads the travel tables with the service client.
 */

import { listTripMedia } from '@vismay/content-source/travelMedia'
import { getTripItinerary, isValidTripSlug, type StopMedia, type TripData } from '@vismay/content-source/travelTrips'
import { htmlStoryBrief } from './brief'
import type { HtmlStoryFormat } from './formats'
import type { StoryStyle } from './styles'

/** At most this many photos listed per stop (and per day for unassigned ones). */
export const MAX_TRIP_CONTEXT_MEDIA_PER_STOP = 40

const ASSETS_SCHEME = 'assets://'
const ASSETS_BUCKET = 'story-assets'

/** A trip with its selected media attached to stops and days, as the journey map reads it. */
export type TripLoader = (tripSlug: string) => Promise<TripData | null>

export interface TravelBriefOptions {
  /** e.g. https://protrip.vismay.xyz — the hosting site. */
  siteUrl: string
  style?: StoryStyle | null
  /** The trip the story is about. Without one the brief carries no trip context. */
  tripSlug?: string | null
  /** One day of the trip (its `n`); omitted, the whole trip. */
  day?: number | null
  /** Editorial intent: what the story is, how the day really went. */
  prompt?: string
  format?: HtmlStoryFormat | null
  /** How to read the trip. Default: the database (loadTripFromDb). */
  loadTrip?: TripLoader
}

export async function travelHtmlStoryBrief({
  siteUrl,
  style,
  tripSlug,
  day,
  prompt,
  format,
  loadTrip = loadTripFromDb,
}: TravelBriefOptions): Promise<string> {
  let context: string | null = null
  if (tripSlug) {
    if (!isValidTripSlug(tripSlug)) throw new Error(`"${tripSlug}" is not a trip slug`)
    const trip = await loadTrip(tripSlug)
    if (!trip) throw new Error(`no itinerary for trip "${tripSlug}" (has travel:sync-trip-db run?)`)
    if (day != null && !trip.days.some((d) => d.n === day)) {
      throw new Error(`trip "${tripSlug}" has no day ${day}`)
    }
    context = buildTripContext(trip, { day, prompt })
  }
  return htmlStoryBrief({ app: 'travel', siteUrl, style, context, format })
}

/**
 * The itinerary from travel_trips.itinerary with travel_trip_media's selected
 * rows attached in curated order. Null when the trip has no mirrored itinerary.
 */
export async function loadTripFromDb(tripSlug: string): Promise<TripData | null> {
  const trip = await getTripItinerary(tripSlug)
  if (!trip) return null
  const rows = (await listTripMedia(tripSlug)).filter((r) => r.selected)
  const stops = new Map(trip.days.flatMap((d) => d.stops.map((s) => [s.slug, s] as const)))
  const days = new Map(trip.days.filter((d) => d.n != null).map((d) => [d.n!, d] as const))
  for (const r of rows) {
    const media: StopMedia = {
      file: r.file,
      ref: `${ASSETS_SCHEME}${tripSlug}/${r.file}`,
      kind: r.kind,
      caption: r.caption ?? undefined,
      takenAt: r.taken_at ?? undefined,
    }
    const stop = r.stop ? stops.get(r.stop) : undefined
    if (stop) stop.media.push(media)
    else if (r.day != null) days.get(r.day)?.media.push(media)
  }
  return trip
}

/** A media ref as the public https URL the page links (the story-assets bucket is public). */
export function tripMediaUrl(ref: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  if (!ref.startsWith(ASSETS_SCHEME) || !supabaseUrl) return ref
  const key = ref.slice(ASSETS_SCHEME.length).replace(/^\/+/, '')
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${ASSETS_BUCKET}/${key}`
}

function mediaLines(media: StopMedia[]): string[] {
  const shown = media.slice(0, MAX_TRIP_CONTEXT_MEDIA_PER_STOP)
  const lines = shown.map((m) => {
    const caption = m.caption ? ` — ${m.caption}` : ''
    return `  - ${m.kind === 'video' ? 'Video' : 'Photo'}: ${tripMediaUrl(m.ref)}${caption}`
  })
  if (media.length > shown.length) lines.push(`  - …and ${media.length - shown.length} more not listed.`)
  return lines
}

const lngLat = (c: [number, number] | null | undefined) => (c ? `[${c[0]}, ${c[1]}]` : 'unknown')

/**
 * The trip as markdown: the brief appends it as its source material. Coordinates
 * are [lng, lat], Mapbox's order.
 */
export function buildTripContext(trip: TripData, { day, prompt }: { day?: number | null; prompt?: string } = {}): string {
  const days = day != null ? trip.days.filter((d) => d.n === day) : trip.days
  const out: string[] = []
  const scope = day != null ? `day ${day} of ` : ''
  out.push(`# Trip context: ${scope}${trip.city}`)
  out.push('')
  if (prompt) {
    out.push(`**The editor's notes:** ${prompt}`)
    out.push('')
  }
  out.push(`- Trip slug: \`${trip.slug}\` (the page's \`<meta name="travel:trip">\`; its slug starts with it)`)
  out.push(`- Trip page (journey map, behind the same password): /t/${trip.slug}`)
  if (trip.startDate || trip.endDate) out.push(`- Dates: ${trip.startDate ?? '?'} to ${trip.endDate ?? '?'}`)
  if (trip.subtitle) out.push(`- ${trip.subtitle}`)
  if (trip.highlights) out.push(`- Highlights: ${trip.highlights}`)
  out.push('- Coordinates are [lng, lat] (Mapbox order). Times are as planned, local.')
  const flights = trip.airports.filter((a) => day == null || a.day === day)
  if (flights.length) {
    out.push('')
    out.push('## Flights')
    for (const a of flights) {
      const when = [a.date, a.time].filter(Boolean).join(' ')
      out.push(`- ${a.kind === 'arrival' ? 'Arrive' : 'Depart'} ${a.name} (${a.code})${when ? `, ${when}` : ''}${a.flight ? `, ${a.flight}` : ''} at ${lngLat(a.coordinates)}`)
    }
  }
  for (const d of days) {
    out.push('')
    out.push(`## ${d.heading || d.title}`)
    if (d.label) out.push(`- ${d.label}`)
    if (d.subtitle) out.push(`- Stops in brief: ${d.subtitle}`)
    out.push(`- Day colour: ${d.color}${d.center ? `; map centre ${lngLat(d.center)}${d.zoom != null ? ` at zoom ${d.zoom}` : ''}` : ''}`)
    if (d.stay) out.push(`- Stay: ${d.stay.name} at ${lngLat(d.stay.coordinates)}`)
    if (d.notes) out.push(`- Notes: ${d.notes}`)
    if (d.media.length) {
      out.push('- Photos from the day not tied to a stop:')
      out.push(...mediaLines(d.media))
    }
    d.stops.forEach((s, i) => {
      out.push('')
      out.push(`### ${i + 1}. ${s.name}${s.time ? ` (${s.time})` : ''}`)
      out.push(`- Stop slug: \`${s.slug}\`; at ${lngLat(s.coordinates)}${s.tag ? `; ${s.tag}` : ''}`)
      if (s.desc) out.push(`- ${s.desc}`)
      if (s.tip) out.push(`- Tip: ${s.tip}`)
      if (s.suggestedBy?.length) out.push(`- Suggested by ${s.suggestedBy.join(', ')}`)
      if (s.media.length) {
        out.push(`- ${s.media.length} curated ${s.media.length === 1 ? 'item' : 'items'}, in order:`)
        out.push(...mediaLines(s.media))
      } else {
        out.push('- No photos.')
      }
    })
  }
  return out.join('\n')
}
