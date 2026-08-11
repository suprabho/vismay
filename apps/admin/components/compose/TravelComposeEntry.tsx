'use client'

import { useEffect, useMemo, useState } from 'react'

interface TripDaySummary {
  n: number
  heading: string
  title: string
  label?: string
  stopCount: number
}

interface TripSummary {
  slug: string
  name: string
  status: string
  city: string | null
  days: TripDaySummary[]
}

/**
 * The travel compose entry — trip-grounded, replacing the generic
 * title+format form: pick a trip and a day, and the compose route builds the
 * whole scrapbook from the itinerary (cover + one spread per stop, camera
 * from stop coordinates, `scrapbook:` blocks; one AI pass writes the prose),
 * then lands on the canvas.
 */
export function TravelComposeEntry() {
  const [trips, setTrips] = useState<TripSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tripSlug, setTripSlug] = useState('')
  const [day, setDay] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/travel/trips')
      .then(async (res) => {
        const data = (await res.json()) as { trips?: TripSummary[]; error?: string }
        if (cancelled) return
        if (!res.ok || !data.trips) {
          setLoadError(data.error ?? 'Failed to load trips')
          return
        }
        setTrips(data.trips)
        const first = data.trips.find((t) => t.days.length > 0)
        if (first) {
          setTripSlug(first.slug)
          setDay(first.days[0]?.n ?? null)
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const trip = useMemo(() => trips?.find((t) => t.slug === tripSlug) ?? null, [trips, tripSlug])
  const dayInfo = useMemo(() => trip?.days.find((d) => d.n === day) ?? null, [trip, day])

  async function create() {
    if (!tripSlug || day == null || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/travel/compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripSlug, day, ...(title.trim() ? { title: title.trim() } : {}) }),
      })
      const data = (await res.json()) as { slug?: string; canvasPath?: string; error?: string }
      if (!res.ok || !data.canvasPath) {
        setError(data.error ?? 'Failed to create scrapbook draft')
        setBusy(false)
        return
      }
      window.location.href = data.canvasPath
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-md border border-sky-500/30 bg-sky-500/5 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-sky-200">Compose a day scrapbook</h2>
        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-300">
          beta
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        Pick a trip and a day — the itinerary shapes the spreads (one per stop, camera on its
        coordinates), curated photos flow in at render time, and one AI pass writes the prose.
      </p>

      {loadError && (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {loadError}
        </div>
      )}
      {trips && trips.length === 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          No trips yet — import one with <code>pnpm travel:import</code>, then sync it with{' '}
          <code>pnpm travel:sync-trip-db</code>.
        </p>
      )}

      {trips && trips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={tripSlug}
            onChange={(e) => {
              const next = trips.find((t) => t.slug === e.target.value)
              setTripSlug(e.target.value)
              setDay(next?.days[0]?.n ?? null)
            }}
            disabled={busy}
            className="rounded-md border border-white/10 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-white/30 disabled:opacity-60"
          >
            {trips.map((t) => (
              <option key={t.slug} value={t.slug} disabled={t.days.length === 0}>
                {t.city ?? t.name}
                {t.days.length === 0 ? ' (itinerary not synced)' : ''}
              </option>
            ))}
          </select>
          <select
            value={day ?? ''}
            onChange={(e) => setDay(Number(e.target.value))}
            disabled={busy || !trip || trip.days.length === 0}
            className="rounded-md border border-white/10 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-white/30 disabled:opacity-60"
          >
            {(trip?.days ?? []).map((d) => (
              <option key={d.n} value={d.n}>
                Day {d.n} · {d.stopCount} stops{d.title ? ` — ${d.title}` : ''}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
            }}
            placeholder={trip?.city ? `Title (default “${trip.city}”)` : 'Title…'}
            disabled={busy}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-white/30 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={create}
            disabled={busy || !tripSlug || day == null || !dayInfo}
            className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-40"
          >
            {busy ? 'Composing… (writes the prose)' : 'Create scrapbook →'}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
