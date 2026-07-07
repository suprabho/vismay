'use client'

/**
 * Pipeline-tab panel for the footshorts data workers (the scheduled GitHub
 * Actions: ingest, scores, fixtures, recap). Shows each worker's last run
 * ("last deployed") and lets the operator fire one — or all of them — on demand
 * via /api/footshorts/workers. Feedback is inline, matching the admin app's
 * toast-free convention (see TriggerRecapButton).
 */

import { useCallback, useEffect, useState } from 'react'
import { relTime, runState, type WorkerLastRun } from './pipelineShared'

interface Worker {
  id: string
  label: string
  description: string
  schedule: string
  lastRun: WorkerLastRun | null
}

type Mode = 'configured' | 'unconfigured'
type Status = { type: 'idle' | 'ok' | 'err' | 'info'; msg?: string }

export function WorkersPanel() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [mode, setMode] = useState<Mode | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  // Pure fetch (no setState) so it's safe to await from a mount effect without
  // tripping react-hooks/set-state-in-effect; callers own the loading flag.
  const fetchWorkers = useCallback(async () => {
    const res = await fetch('/api/footshorts/workers', { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    return body as { workers?: Worker[]; mode?: Mode }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await fetchWorkers()
      setWorkers(body.workers ?? [])
      setMode(body.mode ?? 'configured')
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to load workers' })
    } finally {
      setLoading(false)
    }
  }, [fetchWorkers])

  useEffect(() => {
    let cancelled = false
    fetchWorkers()
      .then((body) => {
        if (cancelled) return
        setWorkers(body.workers ?? [])
        setMode(body.mode ?? 'configured')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to load workers' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchWorkers])

  const trigger = useCallback(
    async (worker: string) => {
      setRunning(worker)
      setStatus({ type: 'idle' })
      try {
        const res = await fetch('/api/footshorts/workers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (body.mode === 'unconfigured') {
          setStatus({
            type: 'info',
            msg: 'Dispatch not configured — set GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO, or run the worker scripts locally.',
          })
          return
        }
        const results: { id: string; ok: boolean }[] = body.results ?? []
        const failed = results.filter((r) => !r.ok)
        if (failed.length > 0) {
          setStatus({
            type: 'err',
            msg: `Dispatched ${results.length - failed.length}/${results.length} — failed: ${failed.map((f) => f.id).join(', ')}`,
          })
        } else {
          const what = worker === 'all' ? `all ${results.length} workers` : worker
          setStatus({ type: 'ok', msg: `Triggered ${what} — runs appear on GitHub Actions shortly.` })
        }
        // Re-read after a beat so the "last run" reflects the new dispatch.
        setTimeout(() => void load(), 2500)
      } catch (err) {
        setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Dispatch failed' })
      } finally {
        setRunning(null)
      }
    },
    [load],
  )

  const busy = running !== null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">Workers</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => void trigger('all')}
            disabled={busy}
            className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-neutral-950 disabled:opacity-40"
          >
            {running === 'all' ? 'Triggering…' : 'Trigger all'}
          </button>
        </div>
      </div>

      {mode === 'unconfigured' ? (
        <p className="mb-2 rounded bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">
          Dispatch not configured — last-run data and triggering need
          GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO. Worker list shown for reference.
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

      <div className="space-y-2">
        {workers.map((w) => {
          const rs = runState(w.lastRun)
          return (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{w.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-neutral-600">{w.schedule}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">{w.description}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className={rs.cls}>{rs.label}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-neutral-400">{relTime(w.lastRun?.createdAt ?? null)}</span>
                  {w.lastRun?.event ? (
                    <span className="text-neutral-600">· {w.lastRun.event.replace(/_/g, ' ')}</span>
                  ) : null}
                  {w.lastRun?.url ? (
                    <a
                      href={w.lastRun.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline"
                    >
                      view
                    </a>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void trigger(w.id)}
                disabled={busy}
                className="ml-3 shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
              >
                {running === w.id ? 'Triggering…' : 'Trigger'}
              </button>
            </div>
          )
        })}
        {!loading && workers.length === 0 ? (
          <p className="text-sm text-neutral-500">No workers found.</p>
        ) : null}
      </div>
    </div>
  )
}
