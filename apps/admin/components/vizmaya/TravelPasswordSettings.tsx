'use client'

import { useEffect, useState, useTransition } from 'react'
import type { TravelTripStatus } from '@vismay/content-source/travelTrips'

interface TripInfo {
  slug: string
  name: string
  status: TravelTripStatus
}

/**
 * The viewer password gate (`travel_trips.password_hash`, migration 073) is
 * keyed per-TRIP, not per-story — a trip can own several day scrapbooks that
 * all share one password. `tripSlug` comes from the story's `trip:`
 * frontmatter (falling back to the story slug itself for legacy stories).
 */
export default function TravelPasswordSettings({ tripSlug }: { tripSlug: string }) {
  const [trip, setTrip] = useState<TripInfo | null | undefined>(undefined)
  const [status, setStatus] = useState<TravelTripStatus>('draft')
  const [password, setPassword] = useState('')
  const [saving, start] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err' | 'idle'; msg?: string }>({
    kind: 'idle',
  })

  useEffect(() => {
    setTrip(undefined)
    fetch(`/api/travel/trips/${tripSlug}`)
      .then(async (res) => {
        if (!res.ok) {
          setTrip(null)
          return
        }
        const body = (await res.json()) as { trip: TripInfo }
        setTrip(body.trip)
        setStatus(body.trip.status)
      })
      .catch(() => setTrip(null))
  }, [tripSlug])

  function save() {
    start(async () => {
      setFeedback({ kind: 'idle' })
      const payload: Record<string, unknown> = {}
      if (trip && status !== trip.status) payload.status = status
      if (password.length > 0) payload.password = password
      if (Object.keys(payload).length === 0) return
      const res = await fetch(`/api/travel/trips/${tripSlug}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback({ kind: 'err', msg: body.error ?? `HTTP ${res.status}` })
        return
      }
      setPassword('')
      setTrip(body.trip)
      setStatus(body.trip.status)
      setFeedback({ kind: 'ok', msg: 'Saved' })
    })
  }

  if (trip === undefined) {
    return <div className="text-sm text-neutral-500">Loading trip gate…</div>
  }

  if (trip === null) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
        No trip row found for "{tripSlug}" — run <code>pnpm travel:sync-trip-db --slug {tripSlug}</code>{' '}
        (and set an initial password with <code>pnpm travel:set-password</code>) before this
        story can be gated from here.
      </div>
    )
  }

  const dirty = status !== trip.status || password.length > 0

  return (
    <div className="space-y-4 max-w-xl border-t border-white/10 pt-6">
      <div>
        <h3 className="text-sm font-medium mb-1">Trip viewer password</h3>
        <p className="text-xs text-neutral-500">
          Shared by every scrapbook day under trip <code className="text-neutral-400">{tripSlug}</code>{' '}
          — the real access boundary (this story stays Draft/unlisted regardless).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Gate status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TravelTripStatus)}
          className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="draft">Draft (locked — no password verifies)</option>
          <option value="live">Live (password gate active)</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Rotate password</label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          placeholder="Leave blank to keep current password"
          className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono"
        />
        <p className="text-xs text-neutral-500 mt-1">
          At least 6 characters. Rotating invalidates any open viewer sessions for this trip.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="bg-white text-neutral-950 rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save gate settings'}
        </button>
        {feedback.kind === 'ok' && <span className="text-xs text-emerald-400">{feedback.msg}</span>}
        {feedback.kind === 'err' && <span className="text-xs text-red-400">{feedback.msg}</span>}
      </div>
    </div>
  )
}
