'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildStandingsTableBlock,
  buildMatchCardBlock,
  buildBracketBlock,
  type StandingRowInput,
  type FixtureRowInput,
} from '@vismay/content-source/footshortsBlocks'

/**
 * "Add football data" picker for the canvas editor — pulls REAL standings,
 * match cards, and brackets from footshorts' own tables (via the
 * `/api/footshorts/data/*` routes) and hands the parent a ready-to-append
 * section. Until now these modules' rows were hand-authored (see
 * `paris-road-to-budapest.config.yaml`); this is the query-from-admin path.
 *
 * Each pick produces ONE section (a single standings table / bracket / match
 * card) so the parent's `appendStorySection` flow stays unchanged.
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

type ModuleKind = 'standings' | 'match-card' | 'bracket'

const MODULES: Array<{ key: ModuleKind; label: string }> = [
  { key: 'standings', label: 'Standings table' },
  { key: 'match-card', label: 'Match card' },
  { key: 'bracket', label: 'Bracket' },
]

/** A foreground layer's position/size, centered with a sensible default width. */
function layerStyle(width: string, height?: string) {
  return {
    position: { x: 'center', y: 'center' },
    size: { width, ...(height ? { height } : {}) },
  }
}

export function FootballDataModal({
  onApply,
  onClose,
  busy,
}: {
  onApply: (section: FootballSection) => void | Promise<void>
  onClose: () => void
  busy?: boolean
}) {
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([])
  const [loadingComps, setLoadingComps] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedKey, setSelectedKey] = useState<string>('') // `${slug}::${season}`
  const [moduleKind, setModuleKind] = useState<ModuleKind>('standings')

  const [standings, setStandings] = useState<StandingRowInput[] | null>(null)
  const [fixtures, setFixtures] = useState<FixtureRowInput[] | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [pickedFixtureId, setPickedFixtureId] = useState<string>('')

  const selected = useMemo(
    () => competitions.find((c) => `${c.slug}::${c.season}` === selectedKey) ?? null,
    [competitions, selectedKey],
  )

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

  // Fetch the rows for the current competition + module.
  useEffect(() => {
    if (!selected) return
    let alive = true
    setLoadingData(true)
    setError(null)
    setStandings(null)
    setFixtures(null)
    setPickedFixtureId('')
    const qs = `competition=${encodeURIComponent(selected.slug)}&season=${encodeURIComponent(selected.season)}`
    void (async () => {
      try {
        if (moduleKind === 'standings') {
          const res = await fetch(`/api/footshorts/data/standings?${qs}`)
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: StandingRowInput[]; error?: string }
          if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
          if (alive) setStandings(body.rows ?? [])
        } else {
          // Bracket wants the knockout slice; match-card lets you pick any fixture.
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
  }, [selected, moduleKind])

  const sideName = (f: FixtureRowInput, side: 'home' | 'away') =>
    (side === 'home' ? f.home?.name ?? f.home_team_name : f.away?.name ?? f.away_team_name) ?? 'TBD'

  // Build the section to append from the current selection.
  const buildSection = useCallback((): FootballSection | null => {
    if (!selected) return null
    const compName = selected.name
    if (moduleKind === 'standings') {
      if (!standings || standings.length === 0) return null
      return {
        heading: `${compName} table`,
        paragraphs: [`${compName} — ${selected.season} standings.`],
        kind: 'data',
        body: {
          layout: 'free',
          foreground: [{ ...buildStandingsTableBlock(standings), style: layerStyle('64%') }],
        },
      }
    }
    if (moduleKind === 'bracket') {
      if (!fixtures || fixtures.length === 0) return null
      return {
        heading: `${compName} bracket`,
        paragraphs: [`${compName} — ${selected.season} knockout bracket.`],
        kind: 'data',
        body: {
          layout: 'free',
          foreground: [
            { ...buildBracketBlock(fixtures), style: layerStyle('100%', '80vh') },
          ],
        },
      }
    }
    // match-card
    const fixture = fixtures?.find((f) => f.id === pickedFixtureId)
    if (!fixture) return null
    const home = sideName(fixture, 'home')
    const away = sideName(fixture, 'away')
    return {
      heading: `${home} vs ${away}`,
      paragraphs: [`${home} vs ${away} — ${compName}.`],
      kind: 'data',
      body: {
        layout: 'free',
        foreground: [
          {
            ...buildMatchCardBlock(fixture, { competitionName: compName, layout: 'horizontal' }),
            style: layerStyle('48%'),
          },
        ],
      },
    }
  }, [selected, moduleKind, standings, fixtures, pickedFixtureId])

  const canApply = useMemo(() => {
    if (loadingData || busy) return false
    if (moduleKind === 'standings') return (standings?.length ?? 0) > 0
    if (moduleKind === 'bracket') return (fixtures?.length ?? 0) > 0
    return !!pickedFixtureId
  }, [loadingData, busy, moduleKind, standings, fixtures, pickedFixtureId])

  const handleApply = async () => {
    const section = buildSection()
    if (!section) return
    await onApply(section)
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
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Add football data</h2>
            <p className="truncate text-[11px] text-neutral-500">
              Real standings, match cards & brackets from footshorts&rsquo; tables
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
              <label className="block text-[11px] text-neutral-500">
                Competition
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none"
                >
                  {competitions.map((c) => (
                    <option key={`${c.slug}::${c.season}`} value={`${c.slug}::${c.season}`}>
                      {c.name} · {c.season}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-1.5">
                {MODULES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setModuleKind(m.key)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      moduleKind === m.key
                        ? 'border-white/30 bg-white/10 text-neutral-100'
                        : 'border-white/10 text-neutral-400 hover:bg-white/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
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
            standings && standings.length > 0 ? (
              <div className="space-y-1">
                <p className="text-neutral-500">{standings.length} rows</p>
                {standings.slice(0, 8).map((r) => (
                  <div key={`${r.group_label ?? ''}-${r.team_id}`} className="flex justify-between text-neutral-300">
                    <span>
                      {r.position}. {r.team?.name ?? r.team_id}
                    </span>
                    <span className="text-neutral-500">{r.points} pts</span>
                  </div>
                ))}
                {standings.length > 8 && <p className="text-neutral-600">+{standings.length - 8} more…</p>}
              </div>
            ) : (
              <p className="py-6 text-center text-neutral-600">No standings for this competition.</p>
            )
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
          ) : fixtures && fixtures.length > 0 ? (
            <div className="space-y-1">
              {fixtures.map((f) => {
                const finished = f.status === 'finished' && f.home_score != null && f.away_score != null
                return (
                  <button
                    key={f.id}
                    onClick={() => setPickedFixtureId(f.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                      pickedFixtureId === f.id
                        ? 'border-white/30 bg-white/10'
                        : 'border-white/10 hover:bg-white/5'
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
            </div>
          ) : (
            <p className="py-6 text-center text-neutral-600">No fixtures for this competition+season.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
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
            {busy ? 'Adding…' : 'Add to section'}
          </button>
        </div>
      </div>
    </div>
  )
}
