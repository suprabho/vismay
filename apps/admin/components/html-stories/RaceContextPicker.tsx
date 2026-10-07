'use client'

import { useEffect, useMemo, useState } from 'react'
import { FlagCheckered, X } from '@phosphor-icons/react'
import { MAX_RACE_CONTEXT_DRIVERS, MAX_RACE_CONTEXT_SESSIONS } from '@vismay/f1-viz/race-context'
import type { TelemetrySession } from '@/components/canvas/compose/useComposeFlow'
import { Chip, btnGhostCls, btnPrimaryCls, inputCls } from '@/components/canvas/compose/ui'

/** What a vizf1 brief's race context covers, as the picker returns it. */
export interface RaceContextPick {
  sessionKeys: string[]
  /** Driver codes (VER). Empty: the context follows the top scorers. */
  drivers: string[]
  prompt?: string
}

/** Session types in the order a weekend runs them. */
const TYPE_ORDER = ['FP1', 'FP2', 'FP3', 'SQ', 'SS', 'S', 'Q', 'R']
const TYPE_LABEL: Record<string, string> = {
  FP1: 'FP1',
  FP2: 'FP2',
  FP3: 'FP3',
  SQ: 'Sprint quali',
  SS: 'Shootout',
  S: 'Sprint',
  Q: 'Quali',
  R: 'Race',
}
const typeRank = (t: string) => {
  const i = TYPE_ORDER.indexOf(t.toUpperCase())
  return i < 0 ? 99 : i
}

type Scope = 'races' | 'quali' | 'all'
const inScope = (scope: Scope, type: string) => {
  const t = type.toUpperCase()
  if (scope === 'races') return t === 'R' || t === 'S'
  if (scope === 'quali') return t === 'Q' || t === 'SQ' || t === 'SS'
  return true
}

/** "Australian Grand Prix 2026 · R1 (R)" → "Australian Grand Prix". */
function weekendName(label: string): string {
  return label.replace(/\s+\d{4}(\s*·.*)?(\s*\(.*\))?$/, '').trim() || label
}

interface Weekend {
  key: string
  name: string
  season: number
  round: number | null
  sessions: TelemetrySession[]
}

/**
 * The race context picker for a vizf1 HTML story brief: tick any ingested
 * sessions — races, sprints, qualifying, practice, from one weekend or across
 * seasons (up to MAX_RACE_CONTEXT_SESSIONS) — then the drivers the story
 * follows (up to MAX_RACE_CONTEXT_DRIVERS, by code, so a driver is followed
 * across team changes; a team chip adds both its cars), plus the editorial
 * angle. The brief then carries @vismay/f1-viz's race context: results, lap
 * timing, sectors, speed traps, strategy, the head-to-head across the sessions
 * and the championship round by round.
 *
 * Sessions come from /api/vizf1/telemetry/sessions (the compose telemetry
 * picker's list), one call with every roster.
 */
export function RaceContextPicker({
  initial,
  onClose,
  onPick,
}: {
  initial: RaceContextPick | null
  onClose: () => void
  onPick: (pick: RaceContextPick) => void
}) {
  const [sessions, setSessions] = useState<TelemetrySession[]>([])
  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState<number | null>(null)
  const [scope, setScope] = useState<Scope>('races')
  const [picked, setPicked] = useState<string[]>(initial?.sessionKeys ?? [])
  const [drivers, setDrivers] = useState<string[]>(initial?.drivers ?? [])
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch('/api/vizf1/telemetry/sessions', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { sessions: [] }))
      .then((data: { sessions?: TelemetrySession[] }) => {
        if (cancelled) return
        const rows = data.sessions ?? []
        setSessions(rows)
        setSeason((cur) => cur ?? rows[0]?.season ?? null)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const byKey = useMemo(() => new Map(sessions.map((s) => [s.sessionKey, s])), [sessions])
  const seasons = useMemo(() => Array.from(new Set(sessions.map((s) => s.season))).sort((a, b) => b - a), [sessions])

  // The season's weekends, newest first, each with its sessions in running order.
  const weekends = useMemo((): Weekend[] => {
    const map = new Map<string, Weekend>()
    for (const s of sessions) {
      if (s.season !== season) continue
      const name = weekendName(s.label)
      const key = `${s.season}:${s.round ?? name}`
      const w = map.get(key) ?? { key, name, season: s.season, round: s.round, sessions: [] }
      w.sessions.push(s)
      map.set(key, w)
    }
    for (const w of map.values()) w.sessions.sort((a, b) => typeRank(a.sessionType) - typeRank(b.sessionType))
    return [...map.values()].sort((a, b) => (b.round ?? 0) - (a.round ?? 0))
  }, [sessions, season])

  // Everyone who ran in a picked session, by code; the latest session's team wins.
  const roster = useMemo(() => {
    const out = new Map<string, { abbr: string; name: string; team: string; colour: string; numbers: Set<number> }>()
    const chosen = picked.map((k) => byKey.get(k)).filter((s): s is TelemetrySession => !!s)
    chosen.sort((a, b) => a.season - b.season || (a.round ?? 0) - (b.round ?? 0))
    for (const s of chosen) {
      for (const d of s.drivers) {
        const abbr = d.abbr.toUpperCase()
        const cur = out.get(abbr) ?? { abbr, name: d.name, team: d.team, colour: d.teamColour, numbers: new Set<number>() }
        cur.team = d.team || cur.team
        cur.colour = d.teamColour || cur.colour
        cur.numbers.add(d.number)
        out.set(abbr, cur)
      }
    }
    return [...out.values()].sort((a, b) => a.team.localeCompare(b.team) || a.abbr.localeCompare(b.abbr))
  }, [picked, byKey])
  const teams = useMemo(() => {
    const out = new Map<string, { team: string; colour: string; abbrs: string[] }>()
    for (const d of roster) {
      if (!d.team) continue
      const t = out.get(d.team) ?? { team: d.team, colour: d.colour, abbrs: [] }
      t.abbrs.push(d.abbr)
      out.set(d.team, t)
    }
    return [...out.values()]
  }, [roster])

  const full = picked.length >= MAX_RACE_CONTEXT_SESSIONS
  function toggleSession(key: string) {
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= MAX_RACE_CONTEXT_SESSIONS ? cur : [...cur, key]))
  }
  /** Tick every in-scope session of the shown season (as far as the cap allows). */
  function pickSeason() {
    const keys = weekends
      .slice()
      .reverse()
      .flatMap((w) => w.sessions.filter((s) => inScope(scope, s.sessionType)).map((s) => s.sessionKey))
    setPicked((cur) => {
      const next = [...cur]
      for (const k of keys) if (!next.includes(k) && next.length < MAX_RACE_CONTEXT_SESSIONS) next.push(k)
      return next
    })
  }
  function toggleDriver(abbr: string) {
    setDrivers((cur) =>
      cur.includes(abbr) ? cur.filter((d) => d !== abbr) : cur.length >= MAX_RACE_CONTEXT_DRIVERS ? cur : [...cur, abbr],
    )
  }
  function addTeam(abbrs: string[]) {
    setDrivers((cur) => {
      const next = [...cur]
      for (const a of abbrs) if (!next.includes(a) && next.length < MAX_RACE_CONTEXT_DRIVERS) next.push(a)
      return next
    })
  }

  const label = 'text-[11px] font-medium uppercase tracking-wide text-neutral-400'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <FlagCheckered size={16} />
              Race context
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Results, lap timing, telemetry, strategy and standings for the sessions and drivers you pick, appended to the agent brief
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="px-1 py-6 text-center text-xs text-neutral-500">Loading ingested sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              No ingested telemetry sessions found. Ingest some with the FastF1 worker first.
            </p>
          ) : (
            <>
              {picked.length > 0 && (
                <div className="space-y-1.5">
                  <span className={label}>
                    Picked · {picked.length}/{MAX_RACE_CONTEXT_SESSIONS}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {picked.map((k) => (
                      <Chip key={k} tone="sky" onClick={() => toggleSession(k)} title="Remove">
                        {byKey.get(k)?.label ?? k}
                        <X size={10} />
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1.5">
                  <span className={`block ${label}`}>Season</span>
                  <select value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))} className={inputCls}>
                    {seasons.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-1.5">
                  <span className={`block ${label}`}>Show</span>
                  <div className="flex gap-1.5">
                    {(
                      [
                        ['races', 'Races & sprints'],
                        ['quali', 'Qualifying'],
                        ['all', 'All sessions'],
                      ] as const
                    ).map(([v, l]) => (
                      <Chip key={v} tone={scope === v ? 'sky' : 'neutral'} onClick={() => setScope(v)}>
                        {l}
                      </Chip>
                    ))}
                  </div>
                </div>
                <button onClick={pickSeason} disabled={full} className={btnGhostCls} title="Tick every shown session of this season">
                  Pick the whole season
                </button>
              </div>

              <div className="space-y-1">
                {weekends.map((w) => {
                  const shown = w.sessions.filter((s) => inScope(scope, s.sessionType))
                  if (!shown.length) return null
                  return (
                    <div key={w.key} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                      <span className="w-56 shrink-0 truncate text-sm text-neutral-200" title={w.name}>
                        {w.round != null && <span className="mr-1.5 text-neutral-500">R{w.round}</span>}
                        {w.name}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {shown.map((s) => {
                          const on = picked.includes(s.sessionKey)
                          return (
                            <Chip
                              key={s.sessionKey}
                              tone={on ? 'sky' : s.ready ? 'neutral' : 'amber'}
                              onClick={() => toggleSession(s.sessionKey)}
                              title={s.ready ? s.label : `${s.label}: positions still ingesting`}
                            >
                              {TYPE_LABEL[s.sessionType.toUpperCase()] ?? s.sessionType}
                            </Chip>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-1.5">
                <span className={label}>
                  Drivers · {drivers.length}/{MAX_RACE_CONTEXT_DRIVERS}{' '}
                  <span className="normal-case text-neutral-600">— optional; none follows the top scorers</span>
                </span>
                {roster.length === 0 ? (
                  <p className="text-xs text-neutral-600">Pick a session to choose its drivers.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {roster.map((d) => (
                        <Chip
                          key={d.abbr}
                          tone={drivers.includes(d.abbr) ? 'sky' : 'neutral'}
                          onClick={() => toggleDriver(d.abbr)}
                          title={`${d.name} (${d.team}) · #${[...d.numbers].join(', #')}`}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.colour }} />
                          {d.abbr}
                        </Chip>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-neutral-600">Add a team:</span>
                      {teams.map((t) => (
                        <Chip key={t.team} onClick={() => addTeam(t.abbrs)} title={t.abbrs.join(' + ')}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.colour }} />
                          {t.team}
                        </Chip>
                      ))}
                    </div>
                  </>
                )}
                {/* A picked driver who isn't in the current sessions stays picked (codes travel across seasons). */}
                {drivers.some((d) => !roster.some((r) => r.abbr === d)) && (
                  <p className="text-[11px] text-amber-400/80">
                    Not in the picked sessions: {drivers.filter((d) => !roster.some((r) => r.abbr === d)).join(', ')}{' '}
                    <button className="underline" onClick={() => setDrivers((cur) => cur.filter((d) => roster.some((r) => r.abbr === d)))}>
                      drop
                    </button>
                  </p>
                )}
              </div>

              <label className="block space-y-1.5">
                <span className={label}>
                  Editorial angle <span className="normal-case text-neutral-600">— optional</span>
                </span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="What should this story be about? e.g. how Norris closed the gap to Verstappen over the flyaways, race by race…"
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
            onClick={() => {
              onPick({ sessionKeys: picked, drivers, prompt: prompt.trim() || undefined })
              onClose()
            }}
            disabled={!picked.length}
            className={btnPrimaryCls}
          >
            Add to brief
          </button>
        </div>
      </div>
    </div>
  )
}
