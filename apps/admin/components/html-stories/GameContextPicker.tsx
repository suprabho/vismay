'use client'

import { useEffect, useMemo, useState } from 'react'
import { Basketball, X } from '@phosphor-icons/react'
import { MAX_GAME_CONTEXT } from '@vismay/html-stories/viznbaBrief'
import { VIZNBA } from '@vismay/randomizer/datasets'
import type { ViznbaGameRef } from '@vismay/randomizer/types'
import { Chip, btnGhostCls, btnPrimaryCls, inputCls } from '@/components/canvas/compose/ui'

/** What a viznba brief's game context covers, as the picker returns it. */
export interface GameContextPick {
  /** ESPN event ids. */
  gameIds: string[]
  /** "Celtics 112 @ Knicks 108" per id, for the chip's tooltip. */
  labels: string[]
  prompt?: string
}

const WINDOWS = [
  [7, 'Last week'],
  [21, 'Last 3 weeks'],
  [60, 'Last 2 months'],
  [120, 'Last 4 months'],
] as const

const short = (name: string) => VIZNBA.teams.find((t) => t.name === name)?.abbreviation ?? name

function gameLabel(g: ViznbaGameRef): string {
  return g.state === 'pre' ? `${short(g.away)} @ ${short(g.home)}` : `${short(g.away)} ${g.awayScore} @ ${short(g.home)} ${g.homeScore}`
}

/**
 * The game context picker for a viznba HTML story brief: games from ESPN's
 * scoreboard (/api/viznba/games, the last few weeks and the week ahead),
 * filtered by team, ticked up to MAX_GAME_CONTEXT, plus the editorial angle.
 * The brief then carries each game's box score (./viznbaBrief's
 * buildGameContext): the score by quarter, team stats, every player's line,
 * the runs, the leaders and ESPN's recap; for a game ahead, the records,
 * recent form, the injury report and ESPN's win probability.
 */
export function GameContextPicker({
  initial,
  onClose,
  onPick,
}: {
  initial: GameContextPick | null
  onClose: () => void
  onPick: (pick: GameContextPick) => void
}) {
  const [back, setBack] = useState<number>(21)
  const [games, setGames] = useState<ViznbaGameRef[]>([])
  const [loaded, setLoaded] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [team, setTeam] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>(initial?.gameIds ?? [])
  const [known, setKnown] = useState<Map<string, ViznbaGameRef>>(new Map())
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const loading = loaded !== back

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/viznba/games?back=${back}&ahead=7`, { cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { games?: ViznbaGameRef[]; error?: string }
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        return body.games ?? []
      })
      .then((rows) => {
        if (cancelled) return
        setGames(rows)
        setKnown((cur) => new Map([...cur, ...rows.map((g) => [g.id, g] as const)]))
        setError(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'could not read the schedule'))
      .finally(() => !cancelled && setLoaded(back))
    return () => {
      cancelled = true
    }
  }, [back])

  // Newest day first; each day's games in tip-off order.
  const days = useMemo(() => {
    const shown = team ? games.filter((g) => g.homeId === team || g.awayId === team) : games
    const map = new Map<string, ViznbaGameRef[]>()
    for (const g of shown) {
      const day = g.date.slice(0, 10)
      map.set(day, [...(map.get(day) ?? []), g])
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [games, team])

  const full = picked.length >= MAX_GAME_CONTEXT
  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((k) => k !== id) : cur.length >= MAX_GAME_CONTEXT ? cur : [...cur, id]))
  }
  /** Tick every shown game that has been played (as far as the cap allows), newest first. */
  function pickShown() {
    const ids = days.flatMap(([, gs]) => gs.filter((g) => g.state !== 'pre').map((g) => g.id))
    setPicked((cur) => {
      const next = [...cur]
      for (const id of ids) if (!next.includes(id) && next.length < MAX_GAME_CONTEXT) next.push(id)
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
              <Basketball size={16} />
              Game context
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Box scores from ESPN for the games you pick (quarters, team stats, every player&rsquo;s line, runs, leaders, recap), appended to the agent brief
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
          {picked.length > 0 && (
            <div className="space-y-1.5">
              <span className={label}>
                Picked · {picked.length}/{MAX_GAME_CONTEXT}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {picked.map((id) => {
                  const g = known.get(id)
                  return (
                    <Chip key={id} tone="sky" onClick={() => toggle(id)} title="Remove">
                      {g ? `${gameLabel(g)} · ${g.date.slice(5, 10)}` : id}
                      <X size={10} />
                    </Chip>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <span className={`block ${label}`}>Window (plus the week ahead)</span>
              <div className="flex flex-wrap gap-1.5">
                {WINDOWS.map(([d, l]) => (
                  <Chip key={d} tone={back === d ? 'sky' : 'neutral'} onClick={() => setBack(d)}>
                    {l}
                  </Chip>
                ))}
              </div>
            </div>
            <label className="space-y-1.5">
              <span className={`block ${label}`}>Team</span>
              <select value={team ?? ''} onChange={(e) => setTeam(e.target.value || null)} className={inputCls}>
                <option value="">All teams</option>
                {[...VIZNBA.teams]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <button onClick={pickShown} disabled={full || loading} className={btnGhostCls} title="Tick every shown game that has been played">
              Pick all shown
            </button>
          </div>

          {loading ? (
            <p className="px-1 py-6 text-center text-xs text-neutral-500">Reading ESPN&rsquo;s schedule…</p>
          ) : error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-3 text-xs text-red-300">{error}</p>
          ) : days.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              No games in this window{team ? ' for this team' : ''}. The off-season? Widen the window.
            </p>
          ) : (
            <div className="space-y-1">
              {days.map(([day, gs]) => (
                <div key={day} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                  <span className="w-24 shrink-0 font-mono text-xs text-neutral-400">{day}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {gs.map((g) => {
                      const on = picked.includes(g.id)
                      return (
                        <Chip
                          key={g.id}
                          tone={on ? 'sky' : g.state === 'pre' ? 'amber' : 'neutral'}
                          onClick={() => toggle(g.id)}
                          title={`${g.away} @ ${g.home}${g.season ? ` · ${g.season}` : ''}${g.state === 'pre' ? ' · not played yet: a preview' : ''}`}
                        >
                          {gameLabel(g)}
                        </Chip>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className={label}>
              Editorial angle <span className="normal-case text-neutral-600">— optional</span>
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="What should this story be about? e.g. how the Knicks' bench won the minutes Brunson sat, game by game…"
              className={`w-full resize-y ${inputCls}`}
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button onClick={onClose} className={btnGhostCls}>
            Cancel
          </button>
          <button
            onClick={() => {
              onPick({
                gameIds: picked,
                labels: picked.map((id) => {
                  const g = known.get(id)
                  return g ? gameLabel(g) : id
                }),
                prompt: prompt.trim() || undefined,
              })
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
