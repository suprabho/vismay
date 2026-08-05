import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import TripJourneyMap from '@/components/journey/TripJourneyMap'
import { requireTripAuth } from '@/lib/gate'
import { readTrip, readTripWithMedia } from '@/lib/trips'

// Password-gated: render per request (the gate reads the visitor's cookie),
// and keep every trip page out of search indexes.
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params
  const trip = readTrip(slug)
  return {
    title: trip ? `${trip.city} — journey map` : 'Trip',
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function TripJourneyPage({ params }: RouteParams) {
  const { slug } = await params
  await requireTripAuth(slug)

  // DB-first media (what /curate edits), YAML manifest fallback.
  const trip = await readTripWithMedia(slug)
  if (!trip) notFound()

  const dayCount = trip.days.filter((d) => d.n != null).length
  const stopCount = trip.days.reduce((n, d) => n + d.stops.length, 0)

  return (
    <div className="h-svh flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-black/10 bg-[#fffdf8]">
        <span className="text-2xl" aria-hidden>
          {trip.emoji ?? '🧭'}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight truncate">{trip.city}</h1>
          <p className="text-xs opacity-60 truncate">
            {[trip.startDate && trip.endDate ? `${trip.startDate} → ${trip.endDate}` : null,
              `${dayCount} days`,
              `${stopCount} stops`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Link
          href={`/t/${slug}/story`}
          className="shrink-0 rounded-full bg-[#2b2419] text-[#fffdf8] px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Read the story →
        </Link>
      </header>
      <TripJourneyMap
        trip={trip}
        accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
      />
    </div>
  )
}
