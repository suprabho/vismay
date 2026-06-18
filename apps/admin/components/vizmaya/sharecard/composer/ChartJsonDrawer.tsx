'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import CodeEditor from '../../CodeEditor'

/**
 * Per-card chart-data editor. Seeds from the card's existing override, else from
 * the story's stored chart-data (`GET /api/chart-data/<slug>/<id>`). On Apply it
 * hands the parsed JSON up; the composer stores it on the hero layer's
 * `dataOverride` — the story's chart-data is never mutated.
 */
export function ChartJsonDrawer({
  slug,
  chartId,
  initial,
  onApply,
  onClose,
}: {
  slug: string
  chartId: string
  initial?: unknown
  onApply: (data: unknown) => void
  onClose: () => void
}) {
  const [value, setValue] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const seedFromStory = () => {
    setLoading(true)
    setLoadError(null)
    fetch(`/api/chart-data/${encodeURIComponent(slug)}/${encodeURIComponent(chartId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json) => setValue(JSON.stringify(json, null, 2)))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load chart data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (initial !== undefined) {
      setValue(JSON.stringify(initial, null, 2))
      return
    }
    seedFromStory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const onChange = (next: string) => {
    setValue(next)
    try {
      JSON.parse(next)
      setParseError(null)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  const apply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      setParseError('Invalid JSON — fix before applying.')
      return
    }
    // A literal `null`/primitive would short-circuit the chart fetch with no
    // data and render a broken chart — require an object/array.
    if (parsed === null || typeof parsed !== 'object') {
      setParseError('Chart data must be a JSON object or array.')
      return
    }
    onApply(parsed)
    onClose()
  }

  const drawer = (
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-950">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center text-xl leading-none text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Edit chart JSON</div>
          <div className="truncate text-sm">{chartId}</div>
        </div>
        <button
          type="button"
          onClick={seedFromStory}
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/10"
        >
          Reset to story data
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!!parseError || !!loadError || loading || !value.trim()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40"
        >
          Apply
        </button>
      </header>
      {(parseError || loadError) && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-1.5 text-[11px] text-red-300">
          {loadError ?? parseError}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="p-4 text-sm text-neutral-500">Loading chart data…</div>
        ) : (
          <CodeEditor value={value} onChange={onChange} language="json" path={`chart-${chartId}.json`} />
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(drawer, document.body)
}
