'use client'

import { useState } from 'react'

/**
 * Launcher shown on the canvas of a story that has no `compose_state` yet.
 * Attaches a fresh compose scaffold to this existing story (the `start` route)
 * and reloads so `CanvasPage` mounts the full `ComposeFlowPanel`
 * (sources → angles → outline). Mirrors the collapsed-panel button so the two
 * states sit in the same spot.
 */
export function ComposeStartButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/stories/${slug}/canvas/compose/start`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to start compose')
        setBusy(false)
        return
      }
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed right-3 top-3 z-50 flex flex-col items-end gap-1">
      <button
        onClick={start}
        disabled={busy}
        title="Research the sources and draft an outline for this story"
        className="rounded-md border border-sky-500/40 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-sky-200 shadow-lg hover:border-sky-400 disabled:opacity-50"
      >
        {busy ? 'Starting…' : '✨ Research & outline'}
      </button>
      {error && (
        <div className="max-w-xs rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}
