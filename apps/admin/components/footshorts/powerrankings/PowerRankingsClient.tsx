'use client'

/**
 * Power rankings review UI: snapshot timeline on the left (newest first,
 * draft/published badge), detail on the right — the ranked table, the Gemini
 * narrative (editable), and publish / unpublish / delete actions. A header
 * "Run scrape" button fires footshorts-theanalyst-power-rankings.yml via
 * /api/footshorts/power-rankings/trigger (TriggerRecapButton pattern).
 *
 * Corrections are deliberately lightweight for v1: the narrative and week
 * label edit inline; the rankings list edits as raw JSON behind a toggle
 * (enough to fix a mis-resolved entity id before publishing).
 */

import { useCallback, useEffect, useState } from 'react'
import type {
  PowerRankingEntry,
  PowerRankingSummary,
  SavedPowerRanking,
} from '@vismay/content-source/footshortsPowerRankings'

type Status = { type: 'idle' | 'ok' | 'err' | 'info'; msg?: string }

function StatusLine({ status }: { status: Status }) {
  if (status.type === 'idle') return null
  return (
    <div
      className={`rounded px-2.5 py-1.5 text-[11px] ${
        status.type === 'err'
          ? 'bg-red-950/30 text-red-300'
          : status.type === 'info'
            ? 'bg-amber-950/30 text-amber-200'
            : 'bg-emerald-950/30 text-emerald-300'
      }`}
    >
      {status.msg}
    </div>
  )
}

function TriggerScrapeButton() {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  const run = useCallback(async () => {
    setRunning(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch('/api/footshorts/power-rankings/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setStatus(
        body.mode === 'unconfigured'
          ? {
              type: 'info',
              msg: 'Dispatch not configured — run `pnpm power-rankings` in the footshorts worker locally.',
            }
          : { type: 'ok', msg: 'Scrape dispatched — a new draft appears here once the run finishes.' },
      )
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Dispatch failed' })
    } finally {
      setRunning(false)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      <StatusLine status={status} />
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
      >
        {running ? 'Dispatching…' : 'Run scrape'}
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
        status === 'published' ? 'bg-emerald-950/40 text-emerald-300' : 'bg-white/5 text-neutral-400'
      }`}
    >
      {status}
    </span>
  )
}

function movementLabel(movement: number | null): string {
  if (movement == null) return ''
  if (movement === 0) return '='
  return movement > 0 ? `▲ ${movement}` : `▼ ${-movement}`
}

export function PowerRankingsClient({ initial }: { initial: PowerRankingSummary[] }) {
  const [list, setList] = useState<PowerRankingSummary[]>(initial)
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null)
  const [detail, setDetail] = useState<SavedPowerRanking | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  const [narrative, setNarrative] = useState('')
  const [weekLabel, setWeekLabel] = useState('')
  const [showJson, setShowJson] = useState(false)
  const [rankingsJson, setRankingsJson] = useState('')

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/footshorts/power-rankings')
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.rankings) setList(body.rankings as PowerRankingSummary[])
  }, [])

  // Detail is cleared wherever selId is cleared (remove()), so a null selId
  // only needs the fetch skipped here — no synchronous setState in the effect.
  const select = useCallback((id: string) => {
    setStatus({ type: 'idle' })
    setSelId(id)
  }, [])

  useEffect(() => {
    if (!selId) return
    let cancelled = false
    fetch(`/api/footshorts/power-rankings/${selId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        return body.ranking as SavedPowerRanking
      })
      .then((ranking) => {
        if (cancelled) return
        setDetail(ranking)
        setNarrative(ranking.narrative ?? '')
        setWeekLabel(ranking.weekLabel ?? '')
        setRankingsJson(JSON.stringify(ranking.rankings, null, 2))
        setShowJson(false)
      })
      .catch((err) => {
        if (!cancelled) setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Load failed' })
      })
    return () => {
      cancelled = true
    }
  }, [selId])

  const save = useCallback(async () => {
    if (!detail) return
    let rankings: PowerRankingEntry[] | undefined
    if (showJson) {
      try {
        const parsed = JSON.parse(rankingsJson)
        if (!Array.isArray(parsed)) throw new Error('rankings JSON must be an array')
        rankings = parsed as PowerRankingEntry[]
      } catch (err) {
        setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Invalid rankings JSON' })
        return
      }
    }
    setBusy(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch(`/api/footshorts/power-rankings/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narrative: narrative.trim() || null,
          weekLabel: weekLabel.trim() || null,
          ...(rankings ? { rankings } : {}),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setDetail(body.ranking as SavedPowerRanking)
      setStatus({ type: 'ok', msg: 'Saved.' })
      await refreshList()
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setBusy(false)
    }
  }, [detail, narrative, weekLabel, showJson, rankingsJson, refreshList])

  const setPublished = useCallback(
    async (publish: boolean) => {
      if (!detail) return
      setBusy(true)
      setStatus({ type: 'idle' })
      try {
        const res = await fetch(
          `/api/footshorts/power-rankings/${detail.id}/${publish ? 'publish' : 'unpublish'}`,
          { method: 'POST' },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setDetail(body.ranking as SavedPowerRanking)
        setStatus({ type: 'ok', msg: publish ? 'Published.' : 'Back to draft.' })
        await refreshList()
      } catch (err) {
        setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Action failed' })
      } finally {
        setBusy(false)
      }
    },
    [detail, refreshList],
  )

  const remove = useCallback(async () => {
    if (!detail) return
    if (!window.confirm('Delete this snapshot? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/footshorts/power-rankings/${detail.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSelId(null)
      setDetail(null)
      await refreshList()
      setStatus({ type: 'ok', msg: 'Deleted.' })
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Delete failed' })
    } finally {
      setBusy(false)
    }
  }, [detail, refreshList])

  const unresolvedCount = detail?.rankings.filter((r) => !r.resolved_entity_id).length ?? 0

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Power rankings</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Weekly Opta Power Rankings from theanalyst.com · {list.length} snapshot{list.length === 1 ? '' : 's'}
          </p>
        </div>
        <TriggerScrapeButton />
      </div>

      {list.length === 0 ? (
        <div className="px-4 py-10 text-sm text-neutral-500 text-center">
          No snapshots yet. Run the scrape (button above), or{' '}
          <code className="font-mono text-neutral-400">pnpm power-rankings</code> in the footshorts
          worker — it runs automatically once a week and lands here as a draft for review.
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr]">
          {/* Timeline */}
          <div className="min-h-0 overflow-y-auto border-r border-white/5 p-3 space-y-2">
            {list.map((r) => {
              const active = r.id === selId
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => select(r.id)}
                  className={`block w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    active ? 'border-sky-500/60 bg-white/[0.04]' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{r.weekLabel ?? 'Unlabeled week'}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {new Date(r.scrapedAt).toLocaleString()} · {r.entryCount} teams
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail */}
          <div className="min-h-0 overflow-y-auto p-5">
            {detail ? (
              <div className="mx-auto max-w-3xl space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="text-xs text-neutral-500">
                    Scraped {new Date(detail.scrapedAt).toLocaleString()} ·{' '}
                    <a
                      href={detail.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline"
                    >
                      source article
                    </a>
                    {detail.publishedAt ? ` · published ${new Date(detail.publishedAt).toLocaleString()}` : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={save}
                      disabled={busy}
                      className="rounded border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/20 hover:text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                    {detail.status === 'draft' ? (
                      <button
                        type="button"
                        onClick={() => setPublished(true)}
                        disabled={busy}
                        className="rounded bg-white px-3 py-1 text-xs font-medium text-neutral-950 disabled:opacity-40"
                      >
                        Publish
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPublished(false)}
                        disabled={busy}
                        className="rounded border border-amber-500/40 px-2.5 py-1 text-xs text-amber-300 hover:border-amber-500/70 disabled:opacity-40"
                      >
                        Unpublish
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={remove}
                      disabled={busy}
                      className="rounded border border-red-500/30 px-2.5 py-1 text-xs text-red-300 hover:border-red-500/60 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <StatusLine status={status} />

                {unresolvedCount > 0 && (
                  <div className="rounded bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">
                    {unresolvedCount} team{unresolvedCount === 1 ? '' : 's'} not resolved to a canonical
                    entity (highlighted below) — fix via the JSON editor before publishing, or add an
                    alias in the worker&apos;s entityResolver.
                  </div>
                )}

                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-neutral-500">Week label</span>
                  <input
                    type="text"
                    value={weekLabel}
                    onChange={(e) => setWeekLabel(e.target.value)}
                    className="mt-1 w-48 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-sky-500/60"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] uppercase tracking-wide text-neutral-500">Narrative</span>
                  <textarea
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    rows={5}
                    placeholder="No narrative — Gemini was unavailable during the scrape. Write one, or leave blank."
                    className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-500/60"
                  />
                </label>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                      Rankings ({detail.rankings.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowJson((v) => !v)}
                      className="text-[11px] text-sky-400 hover:underline"
                    >
                      {showJson ? 'Show table' : 'Edit as JSON'}
                    </button>
                  </div>
                  {showJson ? (
                    <textarea
                      value={rankingsJson}
                      onChange={(e) => setRankingsJson(e.target.value)}
                      rows={18}
                      spellCheck={false}
                      className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-sky-500/60"
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                          <th className="py-1 pr-3 font-normal">#</th>
                          <th className="py-1 pr-3 font-normal">Team</th>
                          <th className="py-1 pr-3 font-normal">Score</th>
                          <th className="py-1 pr-3 font-normal">Move</th>
                          <th className="py-1 font-normal">Entity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.rankings.map((r) => (
                          <tr key={r.rank} className="border-t border-white/5">
                            <td className="py-1.5 pr-3 text-neutral-400">{r.rank}</td>
                            <td className="py-1.5 pr-3 text-white">{r.team_name}</td>
                            <td className="py-1.5 pr-3 text-neutral-300">{r.score ?? ''}</td>
                            <td className="py-1.5 pr-3 text-neutral-300">{movementLabel(r.movement)}</td>
                            <td className="py-1.5">
                              {r.resolved_entity_id ? (
                                <span className="text-[11px] text-emerald-400">resolved</span>
                              ) : (
                                <span className="text-[11px] text-amber-400">unresolved</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Select a snapshot.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
