'use client'

import { useEffect, useMemo, useState } from 'react'
import type { TelemetrySession } from './useComposeFlow'
import { Chip, btnGhostCls, btnPrimaryCls, inputCls } from './ui'

/**
 * "Add telemetry session" picker (vizf1 only). Choose an ingested race, narrow
 * to specific drivers and/or constructors, and add an editorial prompt; on
 * submit the server builds a focused telemetry brief and attaches it as a text
 * source. Empty driver/constructor selection ⇒ the whole field. Drivers and
 * constructors both narrow the brief (their car numbers are unioned server-side).
 */
export function TelemetrySessionPicker({
  onClose,
  loadSessions,
  onCreate,
}: {
  onClose: () => void
  loadSessions: () => Promise<TelemetrySession[]>
  onCreate: (opts: {
    sessionKey: string
    driverNumbers?: number[]
    constructors?: string[]
    prompt?: string
  }) => Promise<boolean>
}) {
  const [sessions, setSessions] = useState<TelemetrySession[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionKey, setSessionKey] = useState('')
  const [drivers, setDrivers] = useState<Set<number>>(new Set())
  const [constructors, setConstructors] = useState<Set<string>>(new Set())
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    loadSessions().then((rows) => {
      if (cancelled) return
      setSessions(rows)
      setSessionKey((cur) => cur || rows[0]?.sessionKey || '')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [loadSessions])

  const session = useMemo(
    () => sessions.find((s) => s.sessionKey === sessionKey) ?? null,
    [sessions, sessionKey],
  )

  // Driver/constructor selections are session-specific — reset when the race changes.
  function changeSession(key: string) {
    setSessionKey(key)
    setDrivers(new Set())
    setConstructors(new Set())
  }
  function toggleDriver(n: number) {
    setDrivers((s) => {
      const next = new Set(s)
      next.has(n) ? next.delete(n) : next.add(n)
      return next
    })
  }
  function toggleConstructor(key: string) {
    setConstructors((s) => {
      const next = new Set(s)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function submit() {
    if (!sessionKey || submitting) return
    setSubmitting(true)
    const ok = await onCreate({
      sessionKey,
      driverNumbers: drivers.size ? Array.from(drivers) : undefined,
      constructors: constructors.size ? Array.from(constructors) : undefined,
      prompt: prompt.trim() || undefined,
    })
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-medium">🏎️ Add telemetry session</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 leading-none text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="px-1 py-6 text-center text-xs text-neutral-500">Loading ingested sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              No ingested telemetry sessions found. Ingest one with the FastF1 worker first.
            </p>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Race</span>
                <select
                  value={sessionKey}
                  onChange={(e) => changeSession(e.target.value)}
                  className={`w-full ${inputCls}`}
                >
                  {sessions.map((s) => (
                    <option key={s.sessionKey} value={s.sessionKey}>
                      {s.label}
                      {s.ready ? '' : ' — not ready'}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Constructors <span className="text-neutral-600 normal-case">— optional</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(session?.constructors ?? []).map((c) => {
                    const key = c.id || c.name
                    return (
                      <Chip
                        key={key}
                        tone={constructors.has(key) ? 'sky' : 'neutral'}
                        onClick={() => toggleConstructor(key)}
                        title={c.name}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.colour }}
                        />
                        {c.name}
                      </Chip>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Drivers <span className="text-neutral-600 normal-case">— optional</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(session?.drivers ?? []).map((d) => (
                    <Chip
                      key={d.number}
                      tone={drivers.has(d.number) ? 'sky' : 'neutral'}
                      onClick={() => toggleDriver(d.number)}
                      title={`${d.name} (${d.team})`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.teamColour }} />
                      {d.abbr} #{d.number}
                    </Chip>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-600">
                  Leave drivers and constructors empty to cover the whole field.
                </p>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Editorial prompt <span className="text-neutral-600 normal-case">— optional</span>
                </span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="What should this story be about? e.g. lead with Verstappen's fastest lap and the late safety car…"
                  className={`w-full resize-y ${inputCls}`}
                />
              </label>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button onClick={onClose} className={btnGhostCls}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!sessionKey || submitting || loading}
            className={btnPrimaryCls}
          >
            {submitting ? 'Building brief…' : 'Add telemetry source'}
          </button>
        </div>
      </div>
    </div>
  )
}
