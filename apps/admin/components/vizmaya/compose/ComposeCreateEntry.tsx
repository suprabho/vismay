'use client'

import { useState } from 'react'

/**
 * Create a compose draft and jump straight into the canvas (the new
 * canvas-native flow). Seeds a minimal story via route 0, then redirects to
 * `/vizmaya/<slug>/canvas`. Shown above the classic in-panel composer while the
 * canvas front stages are built out.
 */
export function ComposeCreateEntry() {
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<'deck' | 'map'>('deck')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/vizmaya/stories/compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, format }),
      })
      const data = (await res.json()) as { ok?: boolean; slug?: string; error?: string }
      if (!res.ok || !data.slug) {
        setError(data.error ?? 'Failed to create draft')
        setBusy(false)
        return
      }
      window.location.href = `/vizmaya/${data.slug}/canvas`
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-md border border-sky-500/30 bg-sky-500/5 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-sky-200">Compose on canvas</h2>
        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-300">
          beta
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        Start a draft and build it in the canvas — sources, angle, and outline as nodes feeding a
        live preview.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
          }}
          placeholder="Story title…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-white/30 disabled:opacity-60"
        />
        <div className="flex overflow-hidden rounded-md border border-white/10">
          {(['deck', 'map'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              disabled={busy}
              className={`px-3 py-1.5 text-xs ${
                format === f ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {f === 'deck' ? 'Deck' : 'mapStory'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={create}
          disabled={busy || !title.trim()}
          className="rounded-md bg-sky-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Open in canvas →'}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
