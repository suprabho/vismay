'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MatchCompetition, MatchOption, MatchTeam } from './useComposeFlow'
import { Chip, btnGhostCls, btnPrimaryCls, inputCls } from './ui'

/** Most matches one compose brief covers — mirrors MAX_BRIEF_MATCHES server-side
 *  (the story pipeline's per-source prompt budget). The HTML-stories brief has no
 *  such budget and passes its own `maxMatches`. */
const MAX_MATCHES = 6

/** Case- and accent-insensitive text match: "celta" finds "RC Celta de Vigo". */
function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

type Scope = 'competition' | 'team'

/**
 * Match picker (footshorts only). Two ways in: a competition + season, or a
 * TEAM — its matches across every competition we hold, so one brief can gather
 * a club's league, cup and European games. Tick matches from any list (picks
 * persist while you switch competition, team or scope, and show in the
 * "Picked" strip), optionally narrow the timeline to one event type, and add
 * an editorial prompt; on submit the caller builds the brief.
 *
 * In compose that brief is the full Opta match-facts stat set, the event
 * timeline and Opta's own insights for each match, attached as a text source;
 * the HTML-stories brief generator reuses the picker (own labels, own cap, no
 * event filter) for its match context.
 *
 * Matches are scraped ON DEMAND, not backfilled: a fixture with no insights
 * shows a "fetch" button that dispatches the match-facts worker for that one
 * match, so an editor pulls exactly what a story needs.
 *
 * Every match is badged with what a brief would actually carry (`facts` = Opta
 * match centre scraped, `events` = timeline rows, `ins` = Opta insight cards),
 * so a fixture with nothing behind it is visibly a weak pick rather than a
 * silent one. The vizf1 analogue is TelemetrySessionPicker; keep the two in step.
 */
export function MatchPicker({
  onClose,
  loadCompetitions,
  loadMatches,
  searchTeams,
  loadTeamMatches,
  onScrape,
  onCreate,
  title = '⚽ Add match',
  subtitle = 'Opta match facts + the event timeline, attached as a source',
  submitLabel = 'Add match source',
  showEventFilter = true,
  maxMatches = MAX_MATCHES,
}: {
  onClose: () => void
  /** Header copy and the submit button — the HTML-stories brief generator reuses this picker with its own. */
  title?: string
  subtitle?: string
  submitLabel?: string
  /** The timeline event-type filter only matters to the compose graft; the HTML brief hides it. */
  showEventFilter?: boolean
  /** How many matches may be ticked. Default the compose brief's 6. */
  maxMatches?: number
  loadCompetitions: () => Promise<MatchCompetition[]>
  loadMatches: (competition: string, season: string) => Promise<MatchOption[]>
  /** The team scope: both or neither. Without them the picker is competition-only. */
  searchTeams?: (q: string) => Promise<MatchTeam[]>
  loadTeamMatches?: (teamSlug: string) => Promise<MatchOption[]>
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
  const hasTeamScope = !!searchTeams && !!loadTeamMatches
  const [scope, setScope] = useState<Scope>('competition')
  const [competitions, setCompetitions] = useState<MatchCompetition[]>([])
  const [loadingComps, setLoadingComps] = useState(true)
  const [selectedKey, setSelectedKey] = useState('') // `${slug}::${season}`
  // Team scope: the typed query, its hits, and the chosen team.
  const [teamQuery, setTeamQuery] = useState('')
  const [teamHits, setTeamHits] = useState<MatchTeam[]>([])
  const [searchingTeams, setSearchingTeams] = useState(false)
  const [team, setTeam] = useState<MatchTeam | null>(null)
  const [matches, setMatches] = useState<MatchOption[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  // Picks carry their row so the strip can show a match from another list
  // (another competition, another team) after the editor moved on.
  const [picked, setPicked] = useState<MatchOption[]>([])
  // Text filter over the loaded list — a league season is 380 fixtures.
  const [search, setSearch] = useState('')
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
  const loaders = useRef({ loadCompetitions, loadMatches, searchTeams, loadTeamMatches })
  useEffect(() => {
    loaders.current = { loadCompetitions, loadMatches, searchTeams, loadTeamMatches }
  })

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

  // Team search, debounced; a chosen team's name in the box is not a new query.
  useEffect(() => {
    const q = teamQuery.trim()
    const search = loaders.current.searchTeams
    if (!search || q.length < 2 || (team && q === team.name)) {
      const t = setTimeout(() => setTeamHits([]), 0)
      return () => clearTimeout(t)
    }
    let cancelled = false
    const t = setTimeout(() => {
      setSearchingTeams(true)
      search(q)
        .then((hits) => {
          if (!cancelled) setTeamHits(hits)
        })
        .finally(() => {
          if (!cancelled) setSearchingTeams(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [teamQuery, team])

  // Bumped by "Refresh" so a dispatched scrape's results can be pulled in
  // without reopening the picker.
  const [reloadNonce, setReloadNonce] = useState(0)

  // The list follows the scope: a competition's season, or a team's matches
  // across competitions. Picks are untouched — they live in `picked`.
  useEffect(() => {
    const source =
      scope === 'competition'
        ? selected
          ? () => loaders.current.loadMatches(selected.slug, selected.season)
          : null
        : team && loaders.current.loadTeamMatches
          ? () => loaders.current.loadTeamMatches!(team.slug)
          : null
    if (!source) return
    let cancelled = false
    setLoadingMatches(true)
    setMatches([])
    setError(null)
    source()
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
  }, [scope, selected, team, reloadNonce])

  async function scrape(m: MatchOption) {
    if (queued.has(m.id)) return
    setNote(null)
    const mode = await onScrape(m.id, m.competition)
    if (mode === 'dispatched') {
      setQueued((s) => new Set(s).add(m.id))
      setNote(`Scraping ${m.home} v ${m.away} — the run takes a minute or two; hit Refresh then.`)
    } else if (mode === 'unconfigured') {
      setNote(
        'Worker dispatch is not configured here — run it locally: npm run match-facts -- ' +
          `--competition=${m.competition} --fixture-id=${m.id}`,
      )
    } else {
      setNote('Could not start the scrape.')
    }
  }

  const pickedIds = useMemo(() => new Set(picked.map((m) => m.id)), [picked])

  function toggle(m: MatchOption) {
    setPicked((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev.filter((x) => x.id !== m.id)
      if (prev.length >= maxMatches) return prev
      return [...prev, m]
    })
  }

  async function submit() {
    if (picked.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    const ok = await onCreate({
      fixtureIds: picked.map((m) => m.id),
      eventFilter: eventFilter === 'all' ? undefined : eventFilter,
      prompt: prompt.trim() || undefined,
    })
    setSubmitting(false)
    if (ok) onClose()
    else setError('Could not build the brief — see the error above the stage.')
  }

  const atCap = picked.length >= maxMatches

  const visible = useMemo(() => {
    const q = normalize(search.trim())
    if (!q) return matches
    return matches.filter((m) => normalize(`${m.home} ${m.away} ${m.competitionName}`).includes(q))
  }, [matches, search])

  const emptyList =
    scope === 'competition'
      ? 'No fixtures for this competition + season.'
      : team
        ? `No fixtures for ${team.name} yet.`
        : 'Search for a team to list its matches across competitions.'

  const scopeBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
      active ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
    }`

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
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="truncate text-[11px] text-neutral-500">{subtitle}</p>
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    {scope === 'competition' ? 'Competition' : 'Team'}
                  </span>
                  {hasTeamScope && (
                    <div className="inline-flex rounded-md border border-white/10 p-0.5" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={scope === 'competition'}
                        onClick={() => setScope('competition')}
                        className={scopeBtn(scope === 'competition')}
                      >
                        By competition
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={scope === 'team'}
                        onClick={() => setScope('team')}
                        className={scopeBtn(scope === 'team')}
                        title="One club's matches across every competition"
                      >
                        By team
                      </button>
                    </div>
                  )}
                </div>
                {scope === 'competition' ? (
                  <select
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    className={`w-full ${inputCls}`}
                    aria-label="Competition"
                  >
                    {competitions.map((c) => (
                      <option key={`${c.slug}::${c.season}`} value={`${c.slug}::${c.season}`}>
                        {c.name} · {c.season}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      type="search"
                      value={teamQuery}
                      onChange={(e) => {
                        setTeamQuery(e.target.value)
                        if (team) setTeam(null)
                      }}
                      placeholder="Type a club name, e.g. Arsenal…"
                      aria-label="Search teams"
                      autoFocus
                      className={`w-full ${inputCls}`}
                    />
                    {(teamHits.length > 0 || searchingTeams) && !team && (
                      <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-white/10 bg-neutral-900 py-1 shadow-xl">
                        {searchingTeams && teamHits.length === 0 && (
                          <li className="px-3 py-2 text-[11px] text-neutral-500">Searching…</li>
                        )}
                        {teamHits.map((t) => (
                          <li key={t.slug}>
                            <button
                              type="button"
                              onClick={() => {
                                setTeam(t)
                                setTeamQuery(t.name)
                                setTeamHits([])
                                setSearch('')
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-200 transition-colors hover:bg-white/10"
                            >
                              {t.crestUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={t.crestUrl} alt="" className="h-4 w-4 object-contain" />
                              ) : (
                                <span className="inline-block h-4 w-4 rounded-full bg-white/10" />
                              )}
                              <span className="truncate">{t.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {teamQuery.trim().length >= 2 && !team && !searchingTeams && teamHits.length === 0 && (
                      <p className="mt-1 text-[11px] text-neutral-600">No team matches &ldquo;{teamQuery.trim()}&rdquo;.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    Matches{' '}
                    <span className="normal-case text-neutral-600">
                      — {picked.length}/{maxMatches} picked
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
                  </div>
                </div>
                {!loadingMatches && matches.length > 0 && (
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={scope === 'competition' ? 'Filter by team…' : 'Filter by opponent or competition…'}
                    aria-label="Filter matches"
                    className={`w-full ${inputCls}`}
                  />
                )}
                {loadingMatches ? (
                  <p className="px-1 py-6 text-center text-xs text-neutral-500">Loading matches…</p>
                ) : matches.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
                    {emptyList}
                  </p>
                ) : visible.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
                    Nothing in this list matches &ldquo;{search.trim()}&rdquo;.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {visible.map((m) => {
                      const checked = pickedIds.has(m.id)
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
                              onChange={() => toggle(m)}
                            />
                            <span className="min-w-0 flex-1 truncate text-neutral-200">
                              {m.home} {played ? `${m.homeScore}–${m.awayScore}` : 'v'} {m.away}
                              {scope === 'team' && (
                                <span className="text-neutral-500"> · {m.competitionName}</span>
                              )}
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

              {picked.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                      Picked{' '}
                      <span className="normal-case text-neutral-600">
                        — kept while you switch competition or team
                      </span>
                    </span>
                    <button
                      onClick={() => setPicked([])}
                      className="text-[11px] text-neutral-400 transition-colors hover:text-neutral-200"
                    >
                      Clear
                    </button>
                  </div>
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {picked.map((m) => {
                      const played =
                        m.status === 'finished' && m.homeScore != null && m.awayScore != null
                      return (
                        <li
                          key={m.id}
                          className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate text-neutral-200">
                            {m.home} {played ? `${m.homeScore}–${m.awayScore}` : 'v'} {m.away}
                            <span className="text-neutral-500">
                              {' '}
                              · {m.competitionName} · {m.kickoffAt.slice(0, 10)}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle(m)}
                            aria-label={`Remove ${m.home} v ${m.away}`}
                            title="Remove"
                            className="shrink-0 rounded p-0.5 leading-none text-neutral-500 transition-colors hover:text-neutral-200"
                          >
                            ✕
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {showEventFilter && (
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
              )}

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
            disabled={picked.length === 0 || submitting}
            className={btnPrimaryCls}
          >
            {submitting ? 'Building brief…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
