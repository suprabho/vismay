'use client'

/**
 * Pipeline-tab panel for the Sportradar World Cup match-timeline sync
 * (apps/footshorts/worker/src/events-sportradar.ts, the `events:sr` script).
 * Shows which finished WC fixtures have timeline events (goals/cards/subs) and
 * which the next run will hydrate, and fires the dedicated
 * footshorts-events-sr.yml workflow on demand — optionally scoped by lookback
 * days or as a dry run. Backed by /api/footshorts/matchtime; feedback is
 * inline, matching WorkersPanel.
 */

import { useCallback, useEffect, useState } from 'react'
import { relTime, runState, type WorkerLastRun } from './pipelineShared'

interface MatchtimeFixture {
  id: string
  kickoffAt: string
  home: string
  away: string
  eventCount: number
}

interface Coverage {
  fixtures: MatchtimeFixture[]
  finished: number
  hydrated: number
  pending: number
}

interface MatchtimeResponse {
  mode?: 'configured' | 'unconfigured'
  worker?: { label: string; description: string; lastRun: WorkerLastRun | null }
  coverage?: Coverage | null
  coverageError?: string
  error?: string
}

type Status = { type: 'idle' | 'ok' | 'err' | 'info'; msg?: string }

function kickoffDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function MatchtimePanel() {
  const [data, setData] = useState<MatchtimeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<Status>({ type: 'idle' })
  const [days, setDays] = useState('')
  const [dry, setDry] = useState(false)

  // Pure fetch (no setState) so it's safe to await from a mount effect without
  // tripping react-hooks/set-state-in-effect; callers own the loading flag.
  const fetchData = useCallback(async () => {
    const res = await fetch('/api/footshorts/matchtime', { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as MatchtimeResponse
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    return body
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchData())
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to load' })
    } finally {
      setLoading(false)
    }
  }, [fetchData])

  useEffect(() => {
    let cancelled = false
    fetchData()
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to load' })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchData])

  const sync = useCallback(async () => {
    setSyncing(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch('/api/footshorts/matchtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: days.trim() || undefined, dry }),
      })
      const body = (await res.json().catch(() => ({}))) as { mode?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (body.mode === 'unconfigured') {
        setStatus({
          type: 'info',
          msg: 'Dispatch not configured — set GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO, or run `pnpm events:sr` in apps/footshorts/worker.',
        })
        return
      }
      setStatus({
        type: 'ok',
        msg: `Triggered the Sportradar sync${dry ? ' (dry run)' : ''} — the run appears on GitHub Actions shortly.`,
      })
      // Re-read after a beat so the "last run" reflects the new dispatch.
      setTimeout(() => void load(), 2500)
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Dispatch failed' })
    } finally {
      setSyncing(false)
    }
  }, [days, dry, load])

  const lastRun = data?.worker?.lastRun ?? null
  const rs = runState(lastRun)
  const coverage = data?.coverage ?? null
  const pendingFixtures = coverage?.fixtures.filter((f) => f.eventCount === 0) ?? []
  const hydratedFixtures = coverage?.fixtures.filter((f) => f.eventCount > 0) ?? []

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">
          Match timelines · Sportradar
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || syncing}
          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {data?.mode === 'unconfigured' ? (
        <p className="mb-2 rounded bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">
          Dispatch not configured — last-run data and triggering need
          GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO. Coverage shown for reference.
        </p>
      ) : null}

      {status.type !== 'idle' ? (
        <div
          className={`mb-2 rounded px-2.5 py-1.5 text-[11px] ${
            status.type === 'err'
              ? 'bg-red-950/30 text-red-300'
              : status.type === 'info'
                ? 'bg-amber-950/30 text-amber-200'
                : 'bg-emerald-950/30 text-emerald-300'
          }`}
        >
          {status.msg}
        </div>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-neutral-500">
              Hydrates finished World Cup fixtures with goals/cards/subs. Idempotent — already
              hydrated matches are skipped. Also runs inside the Scores refresh worker every 12h.
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              <span className={rs.cls}>{rs.label}</span>
              <span className="text-neutral-600">·</span>
              <span className="text-neutral-400">{relTime(lastRun?.createdAt ?? null)}</span>
              {lastRun?.event ? (
                <span className="text-neutral-600">· {lastRun.event.replace(/_/g, ' ')}</span>
              ) : null}
              {lastRun?.url ? (
                <a
                  href={lastRun.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  view
                </a>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-neutral-400">
              Lookback
              <input
                type="number"
                min={1}
                max={90}
                placeholder="14"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-14 rounded-md border border-white/10 bg-transparent px-1.5 py-1 text-xs text-white placeholder:text-neutral-600 focus:border-white/25 focus:outline-none"
              />
              d
            </label>
            <label className="flex items-center gap-1 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={dry}
                onChange={(e) => setDry(e.target.checked)}
                className="accent-sky-400"
              />
              dry run
            </label>
            <button
              type="button"
              onClick={() => void sync()}
              disabled={syncing || loading}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-neutral-950 disabled:opacity-40"
            >
              {syncing ? 'Triggering…' : 'Sync now'}
            </button>
          </div>
        </div>

        {data?.coverageError ? (
          <p className="mt-3 rounded bg-red-950/30 px-2.5 py-1.5 text-[11px] text-red-300">
            Coverage unavailable: {data.coverageError}
          </p>
        ) : coverage ? (
          <div className="mt-3 border-t border-white/5 pt-3">
            <div className="flex gap-4 text-xs text-neutral-400">
              <span>
                Finished <span className="text-white">{coverage.finished}</span>
              </span>
              <span>
                Hydrated <span className="text-emerald-400">{coverage.hydrated}</span>
              </span>
              <span>
                Pending{' '}
                <span className={coverage.pending > 0 ? 'text-amber-400' : 'text-white'}>
                  {coverage.pending}
                </span>
              </span>
            </div>

            {pendingFixtures.length > 0 ? (
              <div className="mt-2 space-y-1">
                {pendingFixtures.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <span className="w-12 shrink-0 text-neutral-500">{kickoffDay(f.kickoffAt)}</span>
                    <span className="text-neutral-200">
                      {f.home} <span className="text-neutral-600">vs</span> {f.away}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-amber-400/80">
                      no events
                    </span>
                  </div>
                ))}
              </div>
            ) : coverage.finished > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">
                All finished WC fixtures have timeline events.
              </p>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">No finished WC fixtures yet.</p>
            )}

            {hydratedFixtures.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-neutral-500 hover:text-neutral-300">
                  Hydrated fixtures ({hydratedFixtures.length})
                </summary>
                <div className="mt-1 space-y-1">
                  {hydratedFixtures.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 text-neutral-500">
                        {kickoffDay(f.kickoffAt)}
                      </span>
                      <span className="text-neutral-300">
                        {f.home} <span className="text-neutral-600">vs</span> {f.away}
                      </span>
                      <span className="text-neutral-500">{f.eventCount} events</span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
