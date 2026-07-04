'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { DcNewsRecap } from '@vismay/content-source/epics'
import { Badge, isStale, timeAgo } from '@/components/vizmaya/dc/shared'

export default function DcRecapsClient() {
  const [recaps, setRecaps] = useState<DcNewsRecap[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState(20)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const r = await fetch(`/api/vizmaya/dc-recaps?limit=${limit}`)
      const body = await r.json().catch(() => null)
      if (cancelled) return
      setLoading(false)
      if (!r.ok) {
        setError(body?.error ?? `HTTP ${r.status}`)
        return
      }
      setRecaps(body.recaps as DcNewsRecap[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [limit, reloadKey])

  const newest = recaps?.[0] ?? null

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">AI Data Centers · daily recaps</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Snapshot timeline of the recap worker&rsquo;s markdown briefs over the trailing 24h of
            news. One row per run — the daily 08:15 UTC cron plus any manual dispatches.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/vizmaya/dc-pipeline"
            className="text-sm text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
          >
            pipeline →
          </Link>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-sm px-3 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200"
          >
            refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs border-b border-white/5 bg-red-950/20 text-red-300">
          {error}
        </div>
      )}

      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500">
          {loading
            ? 'loading…'
            : recaps
              ? `${recaps.length} shown · newest ${timeAgo(newest?.generatedAt ?? null)}`
              : ''}
          {newest && isStale(newest.generatedAt, 36) && (
            <span className="text-amber-300 ml-2">worker looks stale (&gt;36h)</span>
          )}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="uppercase tracking-wider">Show</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-sm bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-neutral-100 cursor-pointer"
            aria-label="Number of recaps to show"
          >
            {[20, 40, 60].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="divide-y divide-white/5">
        {(recaps ?? []).map((r, i) => (
          <li key={r.id} className="px-4 py-4">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-medium truncate">
                {r.headline ?? 'Deterministic brief (no LLM headline)'}
              </span>
              {r.model == null && (
                <span className="text-[10px] uppercase tracking-wider text-amber-300 font-mono shrink-0">
                  deterministic
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-neutral-500">
              <span className="tabular-nums" title={r.generatedAt}>
                {timeAgo(r.generatedAt)}
              </span>
              <span>·</span>
              <span>{r.windowHours}h window</span>
              <span>·</span>
              <span>
                {r.articleCount} {r.articleCount === 1 ? 'story' : 'stories'}
              </span>
              {r.model && (
                <>
                  <span>·</span>
                  <span className="font-mono">{r.model}</span>
                </>
              )}
              {r.topics.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
              {r.tickers.map((t) => (
                <Badge key={t} accent>
                  {t}
                </Badge>
              ))}
            </div>
            <details className="mt-2" open={i === 0}>
              <summary className="text-xs text-neutral-400 hover:text-white cursor-pointer select-none">
                markdown
              </summary>
              <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-neutral-300 bg-black/30 border border-white/10 rounded-lg p-3">
                {r.markdown}
              </pre>
            </details>
          </li>
        ))}
        {recaps && recaps.length === 0 && !loading && (
          <li className="px-4 py-8 text-center text-sm text-neutral-500">
            No recaps yet — dispatch the &ldquo;Generate DC news recap&rdquo; workflow (or wait for
            the 08:15 UTC cron) once the news scrape has stories in the window.
          </li>
        )}
      </ul>
    </div>
  )
}
