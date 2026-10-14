'use client'

import { useEffect, useState } from 'react'
import { Compass, X } from '@phosphor-icons/react'
import { Chip, btnGhostCls, btnPrimaryCls, inputCls } from '@/components/canvas/compose/ui'

/** What a travel brief's trip context covers, as the picker returns it. */
export interface TripContextPick {
  tripSlug: string
  /** One day of the trip; null for the whole trip. */
  day: number | null
  /** "New York · Day 3" for the chip. */
  label: string
  prompt?: string
}

interface TripSummary {
  slug: string
  name: string
  city: string | null
  days: Array<{ n: number; title: string; label?: string; stopCount: number }>
}

/**
 * The trip context picker for a travel HTML story brief: a trip from
 * /api/travel/trips (the trips with a mirrored itinerary), one day of it or
 * the whole trip, and the editor's notes on how the day really went. The
 * brief then carries the trip context (@vismay/html-stories/travelBrief's
 * buildTripContext): the itinerary stop by stop, and the curated photos and
 * clips with their URLs.
 */
export function TripContextPicker({
  initial,
  onClose,
  onPick,
}: {
  initial: TripContextPick | null
  onClose: () => void
  onPick: (pick: TripContextPick) => void
}) {
  const [trips, setTrips] = useState<TripSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tripSlug, setTripSlug] = useState(initial?.tripSlug ?? '')
  const [day, setDay] = useState<number | null>(initial ? initial.day : null)
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch('/api/travel/trips', { cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { trips?: TripSummary[]; error?: string }
        if (!res.ok || !body.trips) throw new Error(body.error ?? `HTTP ${res.status}`)
        return body.trips
      })
      .then((rows) => {
        if (cancelled) return
        setTrips(rows)
        setTripSlug((cur) => cur || rows.find((t) => t.days.length)?.slug || '')
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'could not read the trips'))
    return () => {
      cancelled = true
    }
  }, [])

  const trip = trips?.find((t) => t.slug === tripSlug) ?? null
  const label = 'text-[11px] font-medium uppercase tracking-wide text-neutral-400'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Compass size={16} />
              Trip context
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              The itinerary stop by stop and the curated photos and clips with their URLs, appended to the agent brief
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-3 text-xs text-red-300">{error}</p>
          ) : !trips ? (
            <p className="px-1 py-6 text-center text-xs text-neutral-500">Reading the trips…</p>
          ) : trips.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              No trips with an itinerary yet. Run <code>pnpm travel:sync-trip-db --slug &lt;trip&gt;</code>.
            </p>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className={`block ${label}`}>Trip</span>
                <select
                  value={tripSlug}
                  onChange={(e) => {
                    setTripSlug(e.target.value)
                    setDay(null)
                  }}
                  className={inputCls}
                >
                  {trips.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.city ?? t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </label>
              {trip && (
                <div className="space-y-1.5">
                  <span className={`block ${label}`}>Day</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip tone={day == null ? 'sky' : 'neutral'} onClick={() => setDay(null)}>
                      Whole trip
                    </Chip>
                    {trip.days.map((d) => (
                      <Chip
                        key={d.n}
                        tone={day === d.n ? 'sky' : 'neutral'}
                        onClick={() => setDay(d.n)}
                        title={`${d.title} · ${d.stopCount} stop${d.stopCount === 1 ? '' : 's'}`}
                      >
                        {d.label ?? `Day ${d.n}`}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <label className="block space-y-1.5">
            <span className={label}>
              Notes for the writer <span className="normal-case text-neutral-600">— optional</span>
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="How the day really went: what changed from the plan, totals (steps, km), the moments to linger on…"
              className={`w-full resize-y ${inputCls}`}
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button onClick={onClose} className={btnGhostCls}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!trip) return
              onPick({
                tripSlug: trip.slug,
                day,
                label: `${trip.city ?? trip.name}${day != null ? ` · Day ${day}` : ''}`,
                prompt: prompt.trim() || undefined,
              })
              onClose()
            }}
            disabled={!trip}
            className={btnPrimaryCls}
          >
            Add to brief
          </button>
        </div>
      </div>
    </div>
  )
}
