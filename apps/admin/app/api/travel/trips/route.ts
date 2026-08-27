import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listTravelTrips, getTripItinerary } from '@vismay/content-source/travelTrips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Trips + itinerary summaries for the travel compose entry: which trips
 * exist, and which days each has (a day is composable when the itinerary
 * mirror has been synced — `travel_trips.itinerary`, migration 076).
 * Trips without a synced itinerary come back with `days: []` so the UI can
 * point at `pnpm travel:sync-trip-db`.
 */
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const rows = await listTravelTrips()
    const trips = await Promise.all(
      rows.map(async (row) => {
        let days: Array<{ n: number; heading: string; title: string; label?: string; stopCount: number }> = []
        let city: string | null = null
        try {
          const itinerary = await getTripItinerary(row.slug)
          city = itinerary?.city ?? null
          days = (itinerary?.days ?? [])
            .filter((d) => d.n != null && d.stops.length > 0)
            .map((d) => ({
              n: d.n as number,
              heading: d.heading,
              title: d.title,
              label: d.label,
              stopCount: d.stops.length,
            }))
        } catch {
          // Missing column / unsynced itinerary → not composable yet.
        }
        return { slug: row.slug, name: row.name, status: row.status, city, days }
      }),
    )
    return NextResponse.json({ trips })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
