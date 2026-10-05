'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MatchCompetition, MatchOption } from './useComposeFlow'
import { Chip, btnGhostCls, btnPrimaryCls, inputCls } from './ui'

/** Most matches one brief covers — mirrors MAX_BRIEF_MATCHES server-side. */
const MAX_MATCHES = 6

/**
 * "Add match" picker (footshorts only). Choose a competition+season, tick the
 * matches to brief, narrow the timeline to one event type, and add an editorial
 * prompt; on submit the server builds a match brief — the full Opta match-facts
 * stat set, the event timeline and Opta's own insights for each match — and
 * attaches it as a text source.
 *
 * Matches are scraped ON DEMAND, not backfilled: a fixture with no insights
 * shows a "fetch" button that dispatches the match-facts worker for that one
 * match, so an editor pulls exactly what a story needs.
 *
 * Every match is badged with what a brief would actually carry (`facts` = Opta
 * match centre scraped, `events` = timeline rows, `ins` = Opta insight cards),
 * so a fixture with nothing behind it is visibly a weak pick rather than a
 * silent one. The vizf1
 * analogue is TelemetrySessionPicker; keep the two in step.
 */
export function MatchPicker({
  onClose,
  loadCompetitions,
  loadMatches,
  onScrape,
  onCreate,
}: {
  onClose: () => void
  loadCompetitions: () => Promise<MatchCompetition[]>
  loadMatches: (competition: string, season: string) => Promise<MatchOption[]>
  onScrape: (
    fixtureId: string,
    competition: string,
  ) => Promise<'dispatched' | 'unconfigured' | 'failed'>
  onCreate: (opts: {
    fixtureIds: string[]
    eventFilter?: 'all' | 'goal' | 'card' | 'subst'
    prompt?: string
  }) => Promise<boolean>
}) {
  const [competitions, setCompetitions] = useState<MatchCompetition[]>([])
  const [loadingComps, setLoadingComps] = useState(true)
  const [selectedKey, setSelectedKey] = useState('') // `${slug}::${season}`
  const [matches, setMatches] = useState<MatchOption[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [eventFilter, setEventFilter] = useState<'all' | 'goal' | 'card' | 'subst'>('all')
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Fixtures whose on-demand scrape has been dispatched this session. The run
  // lands a minute or two later, so this is a "queued" marker, not data.
  const [queued, setQueued] = useState<Set<string>>(new Set())
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // The loaders come from useComposeFlow, which rebuilds them on every parent
  // render — depending on them directly would refetch (and drop the editor's
  // picks) whenever anything else in the flow changes, e.g. the `busy` flag the
  // submit itself sets. Read them through a ref so only the selection drives the
  // effects.
  const loaders = useRef({ loadCompetitions, loadMatches })
  loaders.current = { loadCompetitions, loadMatches }

  useEffect(() => {
    let cancelled = false
    loaders.current.loadCompetitions().then((rows) => {
      if (cancelled) return
      setCompetitions(rows)
      setSelectedKey((cur) => cur || (rows[0] ? `${rows[0].slug}::${rows[0].season}` : ''))
      setLoadingComps(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => competitions.find((c) => `${c.slug}::${c.season}` === selectedKey) ?? null,
    [competitions, selectedKey],
  )

  // Bumped by "Refresh" so a dispatched scrape's results can be pulled in
  // without reopening the picker.
  const [reloadNonce, setReloadNonce] = useState(0)

  // Matches are competition-specific — reload (and drop the picks) on a change.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoadingMatches(true)
    setMatches([])
    setError(null)
    loaders.current
      .loadMatches(selected.slug, selected.season)
      .then((rows) => {
        if (cancelled) return
        // Newest first: a brief is nearly always about a just-played match.
        setMatches([...rows].sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt)))
      })
      .finally(() => {
        if (!cancelled) setLoadingMatches(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, reloadNonce])

  // Picks are per-competition — clear them when the competition changes, but
  // NOT on a plain refresh, which would throw away what the editor ticked.
  useEffect(() => {
    setPicked([])
  }, [selected])

  async function scrape(m: MatchOption) {
    if (!selected || queued.has(m.id)) return
    setNote(null)
    const mode = await onScrape(m.id, selected.slug)
    if (mode === 'dispatched') {
      setQueued((s) => new Set(s).add(m.id))
      setNote(`Scraping ${m.home} v ${m.away} — the run takes a minute or two; hit Refresh then.`)
    } else if (mode === 'unconfigured') {
      setNote(
        'Worker dispatch is not configured here — run it locally: npm run match-facts -- ' +
          `--competition=${selected.slug} --fixture-id=${m.id}`,
      )
    } else {
      setNote('Could not start the scrape.')
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_MATCHES) return prev
      return [...prev, id]
    })
  }

  async function submit() {
    if (picked.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    const ok = await onCreate({
      fixtureIds: picked,
      eventFilter: eventFilter === 'all' ? undefined : eventFilter,
      prompt: prompt.trim() || undefined,
    })
    setSubmitting(false)
    if (ok) onClose()
    else setError('Could not build the brief — see the error above the stage.')
  }

  const atCap = picked.length >= MAX_MATCHES

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">⚽ Add match</h2>
            <p className="truncate text-[11px] text-neutral-500">
              Opta match facts + the event timeline, attached as a source
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 leading-none text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loadingComps ? (
            <p className="px-1 py-6 text-center text-xs text-neutral-500">Loading competitions…</p>
          ) : competitions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              No ingested football data yet — run the footshorts fixtures worker first.
            </p>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Competition
                </span>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className={`w-full ${inputCls}`}
                >
                  {competitions.map((c) => (
                    <option key={`${c.slug}::${c.season}`} value={`${c.slug}::${c.season}`}>
                      {c.name} · {c.season}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    Matches{' '}
                    <span className="normal-case text-neutral-600">
                      — {picked.length}/{MAX_MATCHES} picked
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setReloadNonce((n) => n + 1)}
                      disabled={loadingMatches}
                      className="text-[11px] text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-40"
                    >
                      Refresh
                    </button>
                    {picked.length > 0 && (
                      <button
                        onClick={() => setPicked([])}
                        className="text-[11px] text-neutral-400 transition-colors hover:text-neutral-200"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                {loadingMatches ? (
                  <p className="px-1 py-6 text-center text-xs text-neutral-500">Loading matches…</p>
                ) : matches.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
                    No fixtures for this competition + season.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {matches.map((m) => {
                      const checked = picked.includes(m.id)
                      const played =
                        m.status === 'finished' && m.homeScore != null && m.awayScore != null
                      return (
                        <li key={m.id}>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                              checked
                                ? 'border-white/30 bg-white/10'
                                : `border-white/10 ${atCap ? '' : 'hover:bg-white/5'}`
                            } ${atCap && !checked ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={atCap && !checked}
                              onChange={() => toggle(m.id)}
                            />
                            <span className="min-w-0 flex-1 truncate text-neutral-200">
                              {m.home} {played ? `${m.homeScore}–${m.awayScore}` : 'v'} {m.away}
                            </span>
                            {m.facts && (
                              <Chip tone="emerald" title="Opta match facts scraped for this match">
                                facts
                              </Chip>
                            )}
                            {m.events > 0 && (
                              <Chip tone="sky" title={`${m.events} timeline event(s)`}>
                                {m.events} ev
                              </Chip>
                            )}
                            {m.insights > 0 && (
                              <Chip
                                tone="violet"
                                title={`${m.insights} Opta insight(s) — season context for this match`}
                              >
                                {m.insights} ins
                              </Chip>
                            )}
                            {m.insights === 0 &&
                              (queued.has(m.id) ? (
                                <Chip tone="amber" title="Scrape dispatched — hit Refresh shortly">
                                  queued
                                </Chip>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    // Inside a <label>: don't toggle the checkbox.
                                    e.preventDefault()
                                    e.stopPropagation()
                                    void scrape(m)
                                  }}
                                  title="Scrape this match's Opta commentary + insights now"
                                  className="shrink-0 rounded-full border border-white/10 px-2 py-px text-[10px] font-medium uppercase tracking-wide text-neutral-400 transition-colors hover:border-white/30 hover:text-neutral-100"
                                >
                                  fetch
                                </button>
                              ))}
                            <span className="shrink-0 text-[11px] text-neutral-500">
                              {m.kickoffAt.slice(0, 10)}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="text-[11px] text-neutral-600">
                  A match with no badges still briefs its scoreline and card — the facts table and
                  timeline will be empty. <span className="text-neutral-500">Fetch</span> scrapes
                  that one match&rsquo;s Opta commentary + insights on demand.
                </p>
                {note && <p className="text-[11px] leading-relaxed text-amber-300/80">{note}</p>}
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Timeline events
                </span>
                <select
                  value={eventFilter}
                  onChange={(e) =>
                    setEventFilter(e.target.value as 'all' | 'goal' | 'card' | 'subst')
                  }
                  className={`w-full ${inputCls}`}
                >
                  <option value="all">All events</option>
                  <option value="goal">Goals only</option>
                  <option value="card">Cards only</option>
                  <option value="subst">Substitutions only</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Editorial prompt <span className="normal-case text-neutral-600">— optional</span>
                </span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="What should this story be about? e.g. lead with how Arsenal out-shot Chelsea 17–9 and still needed the 88th-minute winner…"
                  className={`w-full resize-y ${inputCls}`}
                />
              </label>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          {error && (
            <p className="mr-auto min-w-0 flex-1 truncate text-[11px] text-red-300" title={error}>
              {error}
            </p>
          )}
          <button onClick={onClose} className={btnGhostCls}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={picked.length === 0 || submitting || loadingMatches}
            className={btnPrimaryCls}
          >
            {submitting ? 'Building brief…' : 'Add match source'}
          </button>
        </div>
      </div>
    </div>
  )
}
