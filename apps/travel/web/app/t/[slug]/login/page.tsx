import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import TripLogin from '@/components/TripLogin'
import { readTrip } from '@/lib/trips'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Trip password',
  robots: { index: false, follow: false, nocache: true },
}

interface RouteParams {
  params: Promise<{ slug: string }>
}

export default async function TripLoginPage({ params }: RouteParams) {
  const { slug } = await params
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) notFound()

  // Show the trip's name/emoji when the content exists locally — but render
  // the same form for unknown slugs so the login page itself doesn't leak
  // which trips exist.
  const trip = readTrip(slug)

  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4" aria-hidden>
          {trip?.emoji ?? '🔒'}
        </div>
        <h1 className="text-2xl font-semibold mb-1">{trip?.city ?? 'This trip'}</h1>
        <p className="text-sm opacity-60 mb-6">
          This trip is shared with friends and family. Enter the trip password you
          were sent to open it.
        </p>
        <TripLogin slug={slug} />
      </div>
    </main>
  )
}
