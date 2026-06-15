'use client'

/**
 * Header action for the Recaps tab: fires footshorts-recap.yml via
 * /api/footshorts/trigger-recap. Click reveals a small filter panel (the same
 * inputs the workflow_dispatch exposes); blank date + 'all' competition is the
 * common "recap today, everything" case. Feedback is an inline status line,
 * matching the admin app's toast-free convention.
 */

import { useCallback, useState } from 'react'

type Status = { type: 'idle' | 'ok' | 'err' | 'info'; msg?: string }

export function TriggerRecapButton() {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  const [date, setDate] = useState('')
  const [competition, setCompetition] = useState('')
  const [team, setTeam] = useState('')
  const [force, setForce] = useState(false)

  const run = useCallback(async () => {
    setRunning(true)
    setStatus({ type: 'idle' })
    try {
      const res = await fetch('/api/footshorts/trigger-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date.trim() || undefined,
          competition: competition.trim() || undefined,
          team: team.trim() || undefined,
          force,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      if (body.mode === 'unconfigured') {
        setStatus({
          type: 'info',
          msg: 'Dispatch not configured — run `pnpm recap` in the footshorts worker locally.',
        })
      } else {
        setStatus({
          type: 'ok',
          msg: 'Recap dispatched — it appears here once the run finishes (a few minutes).',
        })
      }
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Dispatch failed' })
    } finally {
      setRunning(false)
    }
  }, [date, competition, team, force])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
      >
        Trigger recap
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-white/10 bg-neutral-950 p-3 shadow-xl">
          <div className="space-y-2.5">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-sky-500/60"
              />
              <span className="mt-0.5 block text-[10px] text-neutral-600">Blank = today (UTC)</span>
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">Competition</span>
              <input
                type="text"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
                placeholder="all"
                className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-500/60"
              />
              <span className="mt-0.5 block text-[10px] text-neutral-600">slug, e.g. premier-league · blank = all</span>
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">Team</span>
              <input
                type="text"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="(none)"
                className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-sky-500/60"
              />
              <span className="mt-0.5 block text-[10px] text-neutral-600">slug, e.g. real-madrid · blank = no filter</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="accent-sky-500"
              />
              Force (skip end-of-day gate)
            </label>

            <button
              type="button"
              onClick={run}
              disabled={running}
              className="w-full rounded bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 disabled:opacity-40"
            >
              {running ? 'Dispatching…' : 'Run recap'}
            </button>

            {status.type !== 'idle' && (
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
