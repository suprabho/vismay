import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getTripItinerary } from '@vismay/content-source/travelTrips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ slug: string }>
}

/**
 * Stop vocabulary for a trip — feeds the canvas scrapbook panel's stop
 * picker (and any other surface that needs valid `scrapbook.stop` slugs).
 * Read from the DB-mirrored itinerary (migration 076).
 */
export async function GET(_req: Request, { params }: RouteParams) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  try {
    const itinerary = await getTripItinerary(slug)
    if (!itinerary) {
      return NextResponse.json(
        { error: `no itinerary synced for trip "${slug}" — run: pnpm travel:sync-trip-db --slug ${slug}` },
        { status: 404 },
      )
    }
    const days = itinerary.days
      .filter((d) => d.n != null)
      .map((d) => ({
        n: d.n as number,
        title: d.title,
        heading: d.heading,
        stops: d.stops.map((s) => ({
          slug: s.slug,
          name: s.name,
          emoji: s.emoji,
          time: s.time,
        })),
      }))
    return NextResponse.json({ city: itinerary.city, days })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
