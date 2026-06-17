'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  buildStandingsTableBlock,
  buildMatchCardBlock,
  buildMatchTileBlock,
  buildMatchRowBlock,
  buildMatchTimelineBlock,
  buildTeamFormStripBlock,
  buildBracketBlock,
  type StandingRowInput,
  type FixtureRowInput,
  type FixtureEventInput,
  type EventTypeFilter,
  type MatchRowVariant,
} from '@vismay/content-source/footshortsBlocks'

/**
 * "Add football data" picker for the canvas editor — pulls REAL standings,
 * match cards, timelines, brackets, fixtures and form from footshorts' own
 * tables (via the `/api/footshorts/data/*` routes) and hands the parent a
 * ready-to-append section whose `body.foreground` carries the picked `fs:*`
 * viz-module layer(s).
 *
 * This mirrors the share-card creator's data-card set so the two pickers stay at
 * parity: standings get a Group picker for group-stage cups (World Cup, Euros),
 * matches expose every layout (the colorful tile + the editorial cards), and the
 * match timeline / fixtures list / form strip are all selectable.
 *
 * Each pick produces ONE section's worth of foreground layers (usually a single
 * block; the Fixtures list emits one `fs:match-row` per fixture) so the parent's
 * append flow stays unchanged.
 */

export interface FootballSection {
  heading: string
  paragraphs: string[]
  kind: string
  body: Record<string, unknown>
}

interface CompetitionOption {
  slug: string
  name: string
  season: string
  hasStandings: boolean
  hasFixtures: boolean
}

type ModuleKind = 'standings' | 'match' | 'match-timeline' | 'fixtures' | 'form' | 'bracket'

const MODULES: Array<{ key: ModuleKind; label: string }> = [
  { key: 'standings', label: 'Standings' },
  { key: 'match', label: 'Match' },
  { key: 'match-timeline', label: 'Timeline' },
  { key: 'fixtures', label: 'Fixtures' },
  { key: 'form', label: 'Form' },
  { key: 'bracket', label: 'Bracket' },
]

/** The heading match-type card style — the colorful `tile` or one of the
 *  editorial `fs:match-card` layouts. Mirrors the share-card creator. */
type MatchStyle = 'tile' | 'card-horizontal' | 'card-portrait' | 'card-score'

const MATCH_STYLES: Array<{ id: MatchStyle; label: string }> = [
  { id: 'tile', label: 'Tile' },
  { id: 'card-horizontal', label: 'Card · Horizontal' },
  { id: 'card-portrait', label: 'Card · Portrait' },
  { id: 'card-score', label: 'Card · Score' },
]

const CARD_LAYOUT: Record<Exclude<MatchStyle, 'tile'>, 'horizontal' | 'portrait' | 'score'> = {
  'card-horizontal': 'horizontal',
  'card-portrait': 'portrait',
  'card-score': 'score',
}

/** On-screen width per match style — the editorial layouts read narrower than
 *  the wide colorful tile. */
const MATCH_STYLE_WIDTH: Record<MatchStyle, string> = {
  tile: '62%',
  'card-horizontal': '52%',
  'card-portrait': '36%',
  'card-score': '44%',
}

const MATCH_ROW_VARIANTS: Array<{ id: MatchRowVariant; label: string }> = [
  { id: 'compact', label: 'Compact' },
  { id: 'expanded', label: 'Expanded' },
]

/** A foreground layer's position/size, centered with a sensible default width. */
function layerStyle(width: string, height?: string) {
  return {
    position: { x: 'center', y: 'center' },
    size: { width, ...(height ? { height } : {}) },
  }
}

/** Stack the i-th fixtures-list row down from the top so multiple `fs:match-row`
 *  layers don't pile up at center. The user can reposition after dropping. */
function stackedRowStyle(i: number, variant: MatchRowVariant) {
  const step = variant === 'expanded' ? 16 : 9
  return {
    position: { x: 'center', y: `${6 + i * step}%` },
    size: { width: '82%' },
  }
}

const sideName = (f: FixtureRowInput, side: 'home' | 'away') =>
  (side === 'home' ? f.home?.name ?? f.home_team_name : f.away?.name ?? f.away_team_name) ?? 'TBD'

export function FootballDataModal({
  onApply,
  onClose,
  busy,
  applyError,
}: {
  onApply: (section: FootballSection) => void | Promise<void>
  onClose: () => void
  busy?: boolean
  /** Failure from the parent's insert/save, surfaced here so a rejected save
   *  doesn't read as "nothing happened". */
  applyError?: string | null
}) {
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([])
  const [loadingComps, setLoadingComps] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedKey, setSelectedKey] = useState<string>('') // `${slug}::${season}`
  const [moduleKind, setModuleKind] = useState<ModuleKind>('standings')

  const [standings, setStandings] = useState<StandingRowInput[] | null>(null)
  const [fixtures, setFixtures] = useState<FixtureRowInput[] | null>(null)
  const [loadingData, setLoadingData] = useState(false)

  // Per-kind selections (mirrors the share-card creator's controls).
  const [pickedGroup, setPickedGroup] = useState<string>('') // standings group_label
  const [pickedFixtureId, setPickedFixtureId] = useState<string>('') // match / timeline
  const [pickedFixtureIds, setPickedFixtureIds] = useState<string[]>([]) // fixtures list
  const [pickedTeamSlug, setPickedTeamSlug] = useState<string>('') // form
  const [matchStyle, setMatchStyle] = useState<MatchStyle>('tile')
  const [matchRowVariant, setMatchRowVariant] = useState<MatchRowVariant>('compact')
  const [eventFilter, setEventFilter] = useState<EventTypeFilter>('all')

  // Match-timeline events for the picked fixture (re-fetched, like the share card).
  const [events, setEvents] = useState<FixtureEventInput[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  const selected = useMemo(
    () => competitions.find((c) => `${c.slug}::${c.season}` === selectedKey) ?? null,
    [competitions, selectedKey],
  )

  const needsStandings = moduleKind === 'standings'

  // Load the competition+season list once.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/footshorts/data/competitions')
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          competitions?: CompetitionOption[]
          error?: string
        }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (!alive) return
        const comps = body.competitions ?? []
        setCompetitions(comps)
        if (comps[0]) setSelectedKey(`${comps[0].slug}::${comps[0].season}`)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load competitions')
      } finally {
        if (alive) setLoadingComps(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Fetch the rows for the current competition + module. Bracket pulls the
  // knockout slice; every other fixture-backed module wants the full list.
  useEffect(() => {
    if (!selected) return
    let alive = true
    setLoadingData(true)
    setError(null)
    setStandings(null)
    setFixtures(null)
    setPickedGroup('')
    setPickedFixtureId('')
    setPickedFixtureIds([])
    setPickedTeamSlug('')
    const qs = `competition=${encodeURIComponent(selected.slug)}&season=${encodeURIComponent(selected.season)}`
    void (async () => {
      try {
        if (needsStandings) {
          const res = await fetch(`/api/footshorts/data/standings?${qs}`)
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: StandingRowInput[]; error?: string }
          if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (!alive) return
          const rows = body.rows ?? []
          setStandings(rows)
          // Default to the first group for group-stage cups (World Cup, Euros).
          const groups = Array.from(
            new Set(rows.map((r) => r.group_label).filter((g): g is string => !!g)),
          ).sort((a, b) => a.localeCompare(b))
          setPickedGroup(groups[0] ?? '')
        } else {
          const extra = moduleKind === 'bracket' ? '&phase=knockout' : ''
          const res = await fetch(`/api/footshorts/data/fixtures?${qs}${extra}`)
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: FixtureRowInput[]; error?: string }
          if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (alive) setFixtures(body.rows ?? [])
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load data')
      } finally {
        if (alive) setLoadingData(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [selected, moduleKind, needsStandings])

  // Match-timeline: fetch the picked fixture's events (keyed off the fixture,
  // not the competition — same as the share-card creator).
  useEffect(() => {
    if (moduleKind !== 'match-timeline' || !pickedFixtureId) {
      setEvents(null)
      return
    }
    let alive = true
    setEvents(null)
    setEventsLoading(true)
    void (async () => {
      try {
        const res = await fetch(
          `/api/footshorts/data/events?fixtureId=${encodeURIComponent(pickedFixtureId)}`,
        )
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          rows?: FixtureEventInput[]
          error?: string
        }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        if (alive) setEvents(body.rows ?? [])
      } catch (e) {
        if (alive) {
          setEvents([])
          setError(e instanceof Error ? e.message : 'Failed to load events')
        }
      } finally {
        if (alive) setEventsLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [moduleKind, pickedFixtureId])

  // Distinct group labels for group-stage competitions (empty for plain leagues).
  const standingGroups = useMemo(() => {
    const labels = new Set<string>()
    for (const r of standings ?? []) if (r.group_label) labels.add(r.group_label)
    return Array.from(labels).sort((a, b) => a.localeCompare(b))
  }, [standings])

  // Teams available for the form picker, derived from the loaded fixtures.
  const teamOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of fixtures ?? []) {
      if (f.home?.slug) map.set(f.home.slug, f.home.name)
      if (f.away?.slug) map.set(f.away.slug, f.away.name)
    }
    return Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [fixtures])

  const toggleFixture = useCallback((id: string) => {
    setPickedFixtureIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  // Build the section to append from the current selection.
  const buildSection = useCallback((): FootballSection | null => {
    if (!selected) return null
    const compName = selected.name
    const wrap = (heading: string, paragraph: string, foreground: Array<Record<string, unknown>>): FootballSection => ({
      heading,
      paragraphs: [paragraph],
      kind: 'data',
      body: { layout: 'free', foreground },
    })

    if (moduleKind === 'standings') {
      if (!standings || standings.length === 0) return null
      const hasGroups = standingGroups.length > 0
      const rows = hasGroups ? standings.filter((r) => (r.group_label ?? '') === pickedGroup) : standings
      if (rows.length === 0) return null
      const label = hasGroups ? `${compName} table · ${pickedGroup}` : `${compName} table`
      return wrap(label, `${compName} — ${selected.season} standings.`, [
        { ...buildStandingsTableBlock(rows), style: layerStyle('64%') },
      ])
    }

    if (moduleKind === 'bracket') {
      if (!fixtures || fixtures.length === 0) return null
      return wrap(`${compName} bracket`, `${compName} — ${selected.season} knockout bracket.`, [
        { ...buildBracketBlock(fixtures), style: layerStyle('100%', '80vh') },
      ])
    }

    if (moduleKind === 'match') {
      const fixture = fixtures?.find((f) => f.id === pickedFixtureId)
      if (!fixture) return null
      const home = sideName(fixture, 'home')
      const away = sideName(fixture, 'away')
      const block =
        matchStyle === 'tile'
          ? buildMatchTileBlock(fixture)
          : buildMatchCardBlock(fixture, { layout: CARD_LAYOUT[matchStyle], competitionName: compName })
      return wrap(`${home} vs ${away}`, `${home} vs ${away} — ${compName}.`, [
        { ...block, style: layerStyle(MATCH_STYLE_WIDTH[matchStyle]) },
      ])
    }

    if (moduleKind === 'match-timeline') {
      const fixture = fixtures?.find((f) => f.id === pickedFixtureId)
      if (!fixture || !events || events.length === 0) return null
      // Mirror MatchTimeline's render predicate so a filter that hides everything
      // doesn't insert an empty timeline.
      const RENDERED = new Set(['goal', 'card', 'subst'])
      const visible = events.filter(
        (e) => RENDERED.has(e.type) && (eventFilter === 'all' || e.type === eventFilter),
      )
      if (visible.length === 0) return null
      const home = sideName(fixture, 'home')
      const away = sideName(fixture, 'away')
      return wrap(`${home} vs ${away} timeline`, `${home} vs ${away} — match events.`, [
        { ...buildMatchTimelineBlock(events, { filter: eventFilter }), style: layerStyle('70%') },
      ])
    }

    if (moduleKind === 'fixtures') {
      if (!fixtures || pickedFixtureIds.length === 0) return null
      // Render in the fixtures' natural (kickoff) order, not pick order.
      const picked = fixtures.filter((f) => pickedFixtureIds.includes(f.id))
      if (picked.length === 0) return null
      const foreground = picked.map((f, i) => ({
        ...buildMatchRowBlock(f, { variant: matchRowVariant }),
        style: stackedRowStyle(i, matchRowVariant),
      }))
      return wrap(`${compName} fixtures`, `${compName} — ${selected.season} fixtures.`, foreground)
    }

    // form
    if (!pickedTeamSlug || !fixtures) return null
    const teamName = teamOptions.find((t) => t.slug === pickedTeamSlug)?.name ?? pickedTeamSlug
    const teamFixtures = fixtures
      .filter(
        (f) =>
          (f.home?.slug === pickedTeamSlug || f.away?.slug === pickedTeamSlug) &&
          f.status === 'finished',
      )
      .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
      .slice(-5)
    if (teamFixtures.length === 0) return null
    return wrap(`${teamName} form`, `${teamName} — last ${teamFixtures.length}.`, [
      {
        ...buildTeamFormStripBlock(teamFixtures, pickedTeamSlug, {
          label: `${teamName} · last 5`,
          layout: 'grid',
          columns: 5,
          rows: 1,
        }),
        style: layerStyle('80%'),
      },
    ])
  }, [
    selected,
    moduleKind,
    standings,
    standingGroups,
    pickedGroup,
    fixtures,
    pickedFixtureId,
    pickedFixtureIds,
    pickedTeamSlug,
    matchStyle,
    matchRowVariant,
    eventFilter,
    events,
    teamOptions,
  ])

  const canApply = useMemo(() => {
    if (loadingData || busy) return false
    switch (moduleKind) {
      case 'standings':
        return (standings?.length ?? 0) > 0
      case 'bracket':
        return (fixtures?.length ?? 0) > 0
      case 'match':
        return !!pickedFixtureId
      case 'match-timeline':
        return !!pickedFixtureId && !eventsLoading && (events?.length ?? 0) > 0
      case 'fixtures':
        return pickedFixtureIds.length > 0
      case 'form':
        return !!pickedTeamSlug
      default:
        return false
    }
  }, [
    loadingData,
    busy,
    moduleKind,
    standings,
    fixtures,
    pickedFixtureId,
    pickedFixtureIds,
    pickedTeamSlug,
    events,
    eventsLoading,
  ])

  const handleApply = async () => {
    const section = buildSection()
    if (!section) return
    await onApply(section)
  }

  const labelCls = 'block text-[11px] text-neutral-500'
  const selectCls =
    'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none'

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
            <h2 className="text-sm font-semibold tracking-tight">Add football data</h2>
            <p className="truncate text-[11px] text-neutral-500">
              Real standings, matches, timelines, fixtures, form &amp; brackets from footshorts&rsquo; tables
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

        {/* Competition + module pickers */}
        <div className="space-y-2.5 border-b border-white/10 px-4 py-3">
          {loadingComps ? (
            <p className="py-2 text-xs text-neutral-500">Loading competitions…</p>
          ) : competitions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-neutral-600">
              No ingested football data yet — run the footshorts fixtures worker, or pick a
              competition once it&rsquo;s ingested.
            </p>
          ) : (
            <>
              <label className={labelCls}>
                Competition
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className={selectCls}
                >
                  {competitions.map((c) => (
                    <option key={`${c.slug}::${c.season}`} value={`${c.slug}::${c.season}`}>
                      {c.name} · {c.season}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {MODULES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setModuleKind(m.key)}
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      moduleKind === m.key
                        ? 'border-white/30 bg-white/10 text-neutral-100'
                        : 'border-white/10 text-neutral-400 hover:bg-white/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Per-module sub-controls */}
              {moduleKind === 'standings' && standingGroups.length > 0 && (
                <label className={labelCls}>
                  Group
                  <select value={pickedGroup} onChange={(e) => setPickedGroup(e.target.value)} className={selectCls}>
                    {standingGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {moduleKind === 'match' && (
                <label className={labelCls}>
                  Style
                  <select
                    value={matchStyle}
                    onChange={(e) => setMatchStyle(e.target.value as MatchStyle)}
                    className={selectCls}
                  >
                    {MATCH_STYLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {moduleKind === 'match-timeline' && (
                <label className={labelCls}>
                  Event filter
                  <select
                    value={eventFilter}
                    onChange={(e) => setEventFilter(e.target.value as EventTypeFilter)}
                    className={selectCls}
                  >
                    <option value="all">All events</option>
                    <option value="goal">Goals only</option>
                    <option value="card">Cards only</option>
                    <option value="subst">Substitutions only</option>
                  </select>
                </label>
              )}

              {moduleKind === 'fixtures' && (
                <label className={labelCls}>
                  Density
                  <select
                    value={matchRowVariant}
                    onChange={(e) => setMatchRowVariant(e.target.value as MatchRowVariant)}
                    className={selectCls}
                  >
                    {MATCH_ROW_VARIANTS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {moduleKind === 'form' && (
                <label className={labelCls}>
                  Team
                  <select
                    value={pickedTeamSlug}
                    onChange={(e) => setPickedTeamSlug(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Select a team…</option>
                    {teamOptions.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>

        {/* Preview / picker */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-xs">
          {error && (
            <p className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-red-300">
              {error}
            </p>
          )}
          {loadingData ? (
            <p className="py-6 text-center text-neutral-500">Loading…</p>
          ) : moduleKind === 'standings' ? (
            <StandingsPreview standings={standings} pickedGroup={pickedGroup} hasGroups={standingGroups.length > 0} />
          ) : moduleKind === 'bracket' ? (
            fixtures && fixtures.length > 0 ? (
              <p className="text-neutral-400">
                {fixtures.length} knockout fixture(s) — inserts the full bracket tree.
              </p>
            ) : (
              <p className="py-6 text-center text-neutral-600">
                No knockout fixtures for this competition+season.
              </p>
            )
          ) : moduleKind === 'form' ? (
            <p className="text-neutral-400">
              {pickedTeamSlug
                ? 'Inserts the selected team’s last 5 results as a form strip.'
                : 'Pick a team above to insert its recent form.'}
            </p>
          ) : moduleKind === 'fixtures' ? (
            <FixtureMultiPicker
              fixtures={fixtures}
              pickedIds={pickedFixtureIds}
              onToggle={toggleFixture}
              onSelectAll={() => setPickedFixtureIds((fixtures ?? []).map((f) => f.id))}
              onClear={() => setPickedFixtureIds([])}
            />
          ) : (
            // match | match-timeline — single-fixture picker
            <FixturePicker
              fixtures={fixtures}
              pickedId={pickedFixtureId}
              onPick={setPickedFixtureId}
              footer={
                moduleKind === 'match-timeline' && pickedFixtureId ? (
                  eventsLoading ? (
                    <p className="pt-2 text-neutral-500">Loading events…</p>
                  ) : events && events.length === 0 ? (
                    <p className="pt-2 text-neutral-500">No events recorded for this fixture.</p>
                  ) : events ? (
                    <p className="pt-2 text-neutral-500">{events.length} event(s).</p>
                  ) : null
                ) : null
              }
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          {applyError && (
            <p className="mr-auto min-w-0 flex-1 truncate text-[11px] text-red-300" title={applyError}>
              {applyError}
            </p>
          )}
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleApply()}
            disabled={!canApply}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              canApply
                ? 'bg-white text-neutral-900 hover:bg-neutral-200'
                : 'cursor-not-allowed bg-white/10 text-neutral-500'
            }`}
          >
            {busy ? 'Adding…' : 'Add to canvas'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StandingsPreview({
  standings,
  pickedGroup,
  hasGroups,
}: {
  standings: StandingRowInput[] | null
  pickedGroup: string
  hasGroups: boolean
}) {
  if (!standings || standings.length === 0) {
    return <p className="py-6 text-center text-neutral-600">No standings for this competition.</p>
  }
  const rows = hasGroups ? standings.filter((r) => (r.group_label ?? '') === pickedGroup) : standings
  if (rows.length === 0) {
    return <p className="py-6 text-center text-neutral-600">No rows in this group.</p>
  }
  return (
    <div className="space-y-1">
      <p className="text-neutral-500">
        {rows.length} rows{hasGroups ? ` · ${pickedGroup}` : ''}
      </p>
      {rows.slice(0, 8).map((r) => (
        <div key={`${r.group_label ?? ''}-${r.team_id}`} className="flex justify-between text-neutral-300">
          <span>
            {r.position}. {r.team?.name ?? r.team_id}
          </span>
          <span className="text-neutral-500">{r.points} pts</span>
        </div>
      ))}
      {rows.length > 8 && <p className="text-neutral-600">+{rows.length - 8} more…</p>}
    </div>
  )
}

function FixturePicker({
  fixtures,
  pickedId,
  onPick,
  footer,
}: {
  fixtures: FixtureRowInput[] | null
  pickedId: string
  onPick: (id: string) => void
  footer?: ReactNode
}) {
  if (!fixtures || fixtures.length === 0) {
    return <p className="py-6 text-center text-neutral-600">No fixtures for this competition+season.</p>
  }
  return (
    <div className="space-y-1">
      {fixtures.map((f) => {
        const finished = f.status === 'finished' && f.home_score != null && f.away_score != null
        return (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors ${
              pickedId === f.id ? 'border-white/30 bg-white/10' : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <span className="truncate text-neutral-200">
              {sideName(f, 'home')} vs {sideName(f, 'away')}
            </span>
            <span className="shrink-0 pl-2 text-neutral-500">
              {finished ? `${f.home_score}–${f.away_score}` : f.kickoff_at.slice(0, 10)}
            </span>
          </button>
        )
      })}
      {footer}
    </div>
  )
}

function FixtureMultiPicker({
  fixtures,
  pickedIds,
  onToggle,
  onSelectAll,
  onClear,
}: {
  fixtures: FixtureRowInput[] | null
  pickedIds: string[]
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
}) {
  if (!fixtures || fixtures.length === 0) {
    return <p className="py-6 text-center text-neutral-600">No fixtures for this competition+season.</p>
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between pb-1">
        <span className="text-neutral-500">{pickedIds.length} selected</span>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-sky-300 hover:text-sky-200">
            All
          </button>
          <button onClick={onClear} className="text-neutral-400 hover:text-neutral-200">
            Clear
          </button>
        </div>
      </div>
      {fixtures.map((f) => {
        const finished = f.status === 'finished' && f.home_score != null && f.away_score != null
        const checked = pickedIds.includes(f.id)
        return (
          <label
            key={f.id}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
              checked ? 'border-white/30 bg-white/10' : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <input type="checkbox" checked={checked} onChange={() => onToggle(f.id)} />
            <span className="min-w-0 flex-1 truncate text-neutral-200">
              {sideName(f, 'home')} vs {sideName(f, 'away')}
            </span>
            <span className="shrink-0 pl-2 text-neutral-500">
              {finished ? `${f.home_score}–${f.away_score}` : f.kickoff_at.slice(0, 10)}
            </span>
          </label>
        )
      })}
    </div>
  )
}
