'use client'

import { useEffect, useMemo, useState } from 'react'
import DetailSheet from '@/components/DetailSheet'
import {
  getFifaWc26TeamProfile,
  type FifaWc26TeamProfile,
  type FifaWc26Squad,
  type FifaWc26SquadPlayer,
  type FootshortsFixture,
  type FootshortsNewsItem,
  type SquadGroupClub,
  type SquadGroupLeague,
} from '@/lib/fifaWc26'
import { useFifaWc26Squad } from '@/lib/useFifaWc26'

interface Props {
  code: string
  onClose: () => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: FifaWc26TeamProfile }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

type Tab = 'stats' | 'squad' | 'fixtures' | 'news'

export default function TeamDetail({ code, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [tab, setTab] = useState<Tab>('stats')
  const squadQuery = useFifaWc26Squad(code)

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    getFifaWc26TeamProfile(code)
      .then((data) => {
        if (cancelled) return
        if (!data) setState({ kind: 'missing' })
        else setState({ kind: 'ready', data })
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    setTab('stats')
  }, [code])

  const squadCount = squadQuery.data?.total ?? 0
  const availableTabs: Tab[] =
    state.kind === 'ready'
      ? [
          'stats',
          ...(squadCount > 0 ? (['squad'] as const) : []),
          ...(state.data.footshorts.fixtures.length > 0 ? (['fixtures'] as const) : []),
          ...(state.data.footshorts.news.length > 0 ? (['news'] as const) : []),
        ]
      : ['stats']
  const activeTab: Tab = availableTabs.includes(tab) ? tab : 'stats'

  return (
    <DetailSheet>
      <Header
        title={state.kind === 'ready' ? state.data.name : code}
        rank={state.kind === 'ready' ? state.data.fifaRanking : null}
        subtitle={state.kind === 'ready' ? state.data.confederation : undefined}
        onClose={onClose}
      />
      {state.kind === 'ready' && availableTabs.length > 1 && (
        <TabBar
          tabs={availableTabs}
          active={activeTab}
          onChange={setTab}
          squadCount={squadCount}
          fixturesCount={state.data.footshorts.fixtures.length}
          newsCount={state.data.footshorts.news.length}
        />
      )}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        {state.kind === 'loading' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">Loading profile…</p>
        )}
        {state.kind === 'error' && (
          <p className="text-xs font-mono text-rose-400 mt-3">Failed to load: {state.message}</p>
        )}
        {state.kind === 'missing' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">
            No profile data for this team yet.
          </p>
        )}
        {state.kind === 'ready' && (
          <TabContent tab={activeTab} data={state.data} squad={squadQuery.data ?? null} squadLoading={squadQuery.isLoading} />
        )}
      </div>
    </DetailSheet>
  )
}

function TabBar({
  tabs,
  active,
  onChange,
  squadCount,
  fixturesCount,
  newsCount,
}: {
  tabs: Tab[]
  active: Tab
  onChange: (t: Tab) => void
  squadCount: number
  fixturesCount: number
  newsCount: number
}) {
  const label = (t: Tab): string =>
    t === 'stats'
      ? 'Stats'
      : t === 'squad'
      ? 'Squad'
      : t === 'fixtures'
      ? 'Fixtures'
      : 'News'
  const count = (t: Tab): number | null =>
    t === 'squad'
      ? squadCount
      : t === 'fixtures'
      ? fixturesCount
      : t === 'news'
      ? newsCount
      : null
  return (
    <div
      className="flex px-4 shrink-0"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)' }}
    >
      {tabs.map((t) => {
        const isActive = t === active
        const n = count(t)
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className="text-[11px] font-mono uppercase tracking-[0.18em] py-2.5 px-2 transition-colors"
            style={{
              color: isActive
                ? 'var(--vmy-bone)'
                : 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)',
              borderBottom: isActive
                ? '1.5px solid var(--vmy-ember)'
                : '1.5px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label(t)}
            {n != null && (
              <span
                className="ml-1.5"
                style={{ color: 'color-mix(in srgb, var(--vmy-bone) 35%, transparent)' }}
              >
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function TabContent({
  tab,
  data,
  squad,
  squadLoading,
}: {
  tab: Tab
  data: FifaWc26TeamProfile
  squad: FifaWc26Squad | null
  squadLoading: boolean
}) {
  if (tab === 'squad') return <SquadPanel squad={squad} loading={squadLoading} />
  if (tab === 'fixtures') return <FixturesPanel data={data} />
  if (tab === 'news') return <NewsPanel data={data} />
  return <StatsPanel data={data} />
}

function Header({
  title,
  rank,
  subtitle,
  onClose,
}: {
  title: string
  rank: number | null
  subtitle?: string
  onClose: () => void
}) {
  return (
    <div
      className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 shrink-0"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)' }}
    >
      <div className="min-w-0">
        <p
          className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1"
          style={{ color: 'var(--vmy-ember)' }}
        >
          Team profile{subtitle ? ` · ${subtitle}` : ''}
        </p>
        <h2
          className="text-lg leading-snug truncate"
          style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
        >
          {rank != null && (
            <span
              style={{
                color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)',
                fontVariantNumeric: 'tabular-nums',
                marginRight: '0.4em',
              }}
            >
              #{rank}
            </span>
          )}
          {title}
        </h2>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="text-lg leading-none shrink-0 hover:text-white"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
      >
        ×
      </button>
    </div>
  )
}

function fmtInt(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}
function fmtDecimal(n: number | null, digits = 1): string {
  if (n == null) return '—'
  return n.toFixed(digits)
}
function fmtSquadValue(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2)} bn`
  return `${n} mn`
}
function fmtGdp(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2)} tn`
  return `${Math.round(n)} bn`
}
function fmtPopulation(n: number | null): string {
  if (n == null) return '—'
  if (n < 1) return `${Math.round(n * 1000)}k`
  return `${n.toFixed(1)} mn`
}
function fmtLand(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} mn`
  return `${(n / 1000).toFixed(0)}k`
}

function StatsPanel({ data }: { data: FifaWc26TeamProfile }) {
  const tiles: { label: string; value: string; suffix?: string }[] = [
    { label: 'Squad value', value: fmtSquadValue(data.squadValueEurMn), suffix: '€' },
    { label: 'GDP nominal', value: fmtGdp(data.gdpNominalUsdBn), suffix: 'USD' },
    {
      label: 'GDP / capita PPP',
      value: data.gdpPerCapitaPppUsd != null ? `$${fmtInt(data.gdpPerCapitaPppUsd)}` : '—',
    },
    { label: 'Population', value: fmtPopulation(data.populationMn) },
    { label: 'Land area', value: fmtLand(data.landAreaSqKm), suffix: 'sq km' },
    { label: 'Gini index', value: fmtDecimal(data.giniIndex, 1) },
    {
      label: 'EIU Democracy 2024',
      value: fmtDecimal(data.eiuDemocracyIndex2024, 2),
    },
    { label: 'Regime', value: data.regimeType ?? '—' },
    { label: 'GHI 2025', value: fmtDecimal(data.ghi2025Score, 1) },
    {
      label: 'WHR rank 2025',
      value: data.whr2025Rank != null ? `#${data.whr2025Rank}` : '—',
    },
  ]

  return (
    <>
      <Pills isHost={data.isHost} isDebut={data.isDebut} qualification={data.qualification} />

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-md px-3 py-2"
            style={{
              background: 'color-mix(in srgb, var(--vmy-bone) 4%, transparent)',
              border: '1px solid color-mix(in srgb, var(--vmy-bone) 6%, transparent)',
            }}
          >
            <div
              className="text-[9px] font-mono uppercase tracking-[0.18em]"
              style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
            >
              {t.label}
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span
                className="text-base leading-none"
                style={{
                  color: t.value === '—'
                    ? 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)'
                    : 'var(--vmy-bone)',
                  fontWeight: 500,
                }}
              >
                {t.value}
              </span>
              {t.suffix && t.value !== '—' && (
                <span
                  className="text-[10px] font-mono"
                  style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
                >
                  {t.suffix}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p
          className="text-[10px] font-mono uppercase tracking-[0.22em] mb-2"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
        >
          — Rank among the {data.total}
        </p>
        <div className="space-y-2.5">
          <RankBar label="Squad value" rank={data.ranks.squadValue} total={data.total} />
          <RankBar label="GDP per capita PPP" rank={data.ranks.gdpPerCapita} total={data.total} />
          <RankBar label="Population" rank={data.ranks.population} total={data.total} />
          <RankBar
            label="EIU Democracy Index"
            rank={data.ranks.eiuDemocracyIndex}
            total={data.total}
          />
        </div>
      </div>

      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        Squad values: Transfermarkt (Oct–Nov 2025). GDP / population: IMF & World Bank 2024.
        Democracy Index: EIU 2024. FIFA rank: Apr 2026. GHI 2025, WHR 2025.
      </p>
    </>
  )
}

function FixturesPanel({ data }: { data: FifaWc26TeamProfile }) {
  return (
    <>
      <ul className="space-y-2 mt-1">
        {data.footshorts.fixtures.map((f) => (
          <FixtureRow key={f.id} fixture={f} teamName={data.name} />
        ))}
      </ul>
      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        Fixtures: football-data.org.
      </p>
    </>
  )
}

function NewsPanel({ data }: { data: FifaWc26TeamProfile }) {
  return (
    <>
      <ul className="space-y-3 mt-1">
        {data.footshorts.news.map((n) => (
          <NewsRow key={n.id} item={n} />
        ))}
      </ul>
      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        News summaries: footshorts RSS via Gemini.
      </p>
    </>
  )
}

function FixtureRow({
  fixture,
  teamName,
}: {
  fixture: FootshortsFixture
  teamName: string
}) {
  const status = fixture.status.toLowerCase()
  const isFinished = status === 'finished'
  const isLive = status === 'live'
  const opponent = fixture.isHome ? fixture.awayTeam : fixture.homeTeam
  const venue = fixture.isHome ? 'vs' : '@'
  const date = new Date(fixture.kickoffAt)
  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  // Score from this team's perspective: ownGoals - oppGoals
  let scoreLabel: string | null = null
  if ((isFinished || isLive) && fixture.homeScore != null && fixture.awayScore != null) {
    const own = fixture.isHome ? fixture.homeScore : fixture.awayScore
    const opp = fixture.isHome ? fixture.awayScore : fixture.homeScore
    scoreLabel = `${own}–${opp}`
  }

  const statusTone = isLive
    ? 'var(--vmy-ember)'
    : isFinished
    ? 'color-mix(in srgb, var(--vmy-bone) 70%, transparent)'
    : 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)'

  // teamName retained for parity with the source; opponent is derived from isHome.
  void teamName

  return (
    <li
      className="rounded-md px-3 py-2"
      style={{
        background: 'color-mix(in srgb, var(--vmy-bone) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--vmy-bone) 6%, transparent)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug truncate" style={{ color: 'var(--vmy-bone)' }}>
            <span
              className="text-[10px] font-mono uppercase mr-1.5"
              style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
            >
              {venue}
            </span>
            {opponent}
          </div>
          <div
            className="text-[10px] font-mono mt-0.5"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
          >
            {dateLabel}
            {!isFinished && <> · {timeLabel}</>}
            {fixture.venue && <> · {fixture.venue}</>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {scoreLabel && (
            <div
              className="text-base font-mono leading-none"
              style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
            >
              {scoreLabel}
            </div>
          )}
          <div
            className="text-[9px] font-mono uppercase tracking-[0.18em] mt-1"
            style={{ color: statusTone }}
          >
            {status}
          </div>
        </div>
      </div>
    </li>
  )
}

function NewsRow({ item }: { item: FootshortsNewsItem }) {
  const date = new Date(item.publishedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5 font-mono">
          {date}
          {item.publisher && <span className="ml-2">· {item.publisher}</span>}
        </div>
        <div className="text-sm text-zinc-200 group-hover:text-amber-200 leading-snug">
          {item.title}
        </div>
        {item.summary && (
          <div className="text-xs text-zinc-500 mt-1 leading-snug line-clamp-3">
            {item.summary}
          </div>
        )}
      </a>
    </li>
  )
}

function Pills({
  isHost,
  isDebut,
  qualification,
}: {
  isHost: boolean
  isDebut: boolean
  qualification: string
}) {
  const pills: { label: string; tone: 'accent' | 'high' | 'muted' }[] = []
  if (isHost) pills.push({ label: 'Host', tone: 'high' })
  if (isDebut) pills.push({ label: 'Debut', tone: 'high' })
  if (qualification && !isHost) pills.push({ label: qualification, tone: 'muted' })
  if (pills.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {pills.map((p) => (
        <span
          key={p.label}
          className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded"
          style={{
            background:
              p.tone === 'high'
                ? 'color-mix(in srgb, var(--vmy-ember) 22%, transparent)'
                : 'color-mix(in srgb, var(--vmy-bone) 6%, transparent)',
            border:
              p.tone === 'high'
                ? '1px solid color-mix(in srgb, var(--vmy-ember) 50%, transparent)'
                : '1px solid color-mix(in srgb, var(--vmy-bone) 10%, transparent)',
            color:
              p.tone === 'high'
                ? 'var(--vmy-bone)'
                : 'color-mix(in srgb, var(--vmy-bone) 70%, transparent)',
          }}
        >
          {p.label}
        </span>
      ))}
    </div>
  )
}

function RankBar({
  label,
  rank,
  total,
}: {
  label: string
  rank: number | null
  total: number
}) {
  if (rank == null) {
    return (
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span
            className="text-[10px] font-mono uppercase tracking-[0.18em]"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
          >
            {label}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
          >
            no data
          </span>
        </div>
        <div
          className="h-1.5 rounded-full"
          style={{ background: 'color-mix(in srgb, var(--vmy-bone) 6%, transparent)' }}
        />
      </div>
    )
  }
  const filled = (total - rank) / Math.max(1, total - 1)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span
          className="text-[10px] font-mono uppercase tracking-[0.18em]"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
        >
          {label}
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--vmy-bone)' }}>
          #{rank} of {total}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'color-mix(in srgb, var(--vmy-bone) 6%, transparent)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(2, Math.round(filled * 100))}%`,
            background: 'var(--vmy-ember)',
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Squad panel: treemap (league > club) on top, roster table below.

function SquadPanel({
  squad,
  loading,
}: {
  squad: FifaWc26Squad | null
  loading: boolean
}) {
  if (loading) {
    return <p className="text-xs font-mono text-zinc-500 mt-3">Loading squad…</p>
  }
  if (!squad || squad.total === 0) {
    return (
      <p className="text-xs font-mono text-zinc-500 mt-3">
        No squad announced yet for this team.
      </p>
    )
  }
  return (
    <>
      <SquadBreakdown squad={squad} />
      <SquadRoster players={squad.players} />
      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        Squad source: {Array.from(new Set(squad.players.map((p) => p.source ?? 'manual'))).join(' · ')}.
        Clubs reflect call-up time; players unmatched to a club entity show their raw club name.
      </p>
    </>
  )
}

function SquadBreakdown({ squad }: { squad: FifaWc26Squad }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p
          className="text-[10px] font-mono uppercase tracking-[0.22em]"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
        >
          — Composition · {squad.total} players · {squad.byLeague.length}{' '}
          {squad.byLeague.length === 1 ? 'league' : 'leagues'}
        </p>
      </div>
      <Treemap leagues={squad.byLeague} total={squad.total} />
      <SquadLegend leagues={squad.byLeague} total={squad.total} />
    </div>
  )
}

// Slice-and-dice treemap: leagues stacked vertically (heights = league share),
// clubs split horizontally inside each league (widths = club share within
// league). Simple, deterministic, no external deps. Width = 100% of container,
// height fixed at 220px so the panel doesn't dominate the sheet on mobile.

const TREEMAP_HEIGHT = 220

const LEAGUE_HUES = [
  '#4cb46a',
  '#f0c64b',
  '#5aa3e0',
  '#c25fb6',
  '#e08a3c',
  '#7ad6c3',
  '#b88de3',
  '#e36b6b',
] as const

function leagueColor(idx: number, isUnmatched: boolean): string {
  if (isUnmatched) return 'color-mix(in srgb, var(--vmy-bone) 18%, transparent)'
  return LEAGUE_HUES[idx % LEAGUE_HUES.length]
}

function Treemap({
  leagues,
  total,
}: {
  leagues: SquadGroupLeague[]
  total: number
}) {
  if (total === 0) return null
  return (
    <div
      className="w-full rounded-md overflow-hidden flex flex-col"
      style={{
        height: TREEMAP_HEIGHT,
        border: '1px solid color-mix(in srgb, var(--vmy-bone) 10%, transparent)',
      }}
    >
      {leagues.map((l, i) => {
        const heightPct = (l.count / total) * 100
        const color = leagueColor(i, l.leagueSlug == null)
        return (
          <div
            key={l.leagueSlug ?? `__unmatched-${i}`}
            className="flex w-full relative"
            style={{
              height: `${heightPct}%`,
              borderTop: i > 0 ? '1px solid var(--vmy-ink)' : 'none',
            }}
          >
            {l.clubs.map((c, j) => {
              const widthPct = (c.count / l.count) * 100
              return (
                <TreemapClubCell
                  key={`${l.leagueSlug ?? 'u'}-${c.clubSlug ?? c.clubName}-${j}`}
                  league={l.leagueName}
                  club={c}
                  widthPct={widthPct}
                  color={color}
                  isFirst={j === 0}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function TreemapClubCell({
  league,
  club,
  widthPct,
  color,
  isFirst,
}: {
  league: string
  club: SquadGroupClub
  widthPct: number
  color: string
  isFirst: boolean
}) {
  const showLabel = widthPct >= 12
  return (
    <div
      title={`${league} · ${club.clubName} · ${club.count}`}
      className="relative flex items-end px-1.5 py-1 overflow-hidden"
      style={{
        width: `${widthPct}%`,
        background: `color-mix(in srgb, ${color} 28%, transparent)`,
        borderLeft: isFirst ? 'none' : '1px solid var(--vmy-ink)',
      }}
    >
      {showLabel && (
        <div className="min-w-0 flex flex-col leading-tight">
          <span
            className="text-[10px] truncate"
            style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
          >
            {club.clubName}
          </span>
          <span
            className="text-[9px] font-mono"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 60%, transparent)' }}
          >
            {club.count}
          </span>
        </div>
      )}
      {!showLabel && (
        <span
          className="text-[9px] font-mono"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 75%, transparent)' }}
        >
          {club.count}
        </span>
      )}
    </div>
  )
}

function SquadLegend({
  leagues,
  total,
}: {
  leagues: SquadGroupLeague[]
  total: number
}) {
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
      {leagues.map((l, i) => {
        const color = leagueColor(i, l.leagueSlug == null)
        const pct = Math.round((l.count / total) * 100)
        return (
          <div
            key={l.leagueSlug ?? `__unmatched-legend-${i}`}
            className="flex items-baseline gap-1.5 min-w-0"
          >
            <span
              className="w-2 h-2 shrink-0 rounded-sm"
              style={{ background: `color-mix(in srgb, ${color} 60%, transparent)` }}
            />
            <span
              className="text-[10px] truncate"
              style={{ color: 'var(--vmy-bone)' }}
            >
              {l.leagueName}
            </span>
            <span
              className="text-[10px] font-mono ml-auto shrink-0"
              style={{ color: 'color-mix(in srgb, var(--vmy-bone) 55%, transparent)' }}
            >
              {l.count} · {pct}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

function SquadRoster({ players }: { players: FifaWc26SquadPlayer[] }) {
  // Group by FIFA position bucket. Position strings are free-form across
  // sources ("GK", "Goalkeeper", "Defender" etc.) — normalize to a coarse
  // bucket so the roster is scannable.
  const buckets = useMemo(() => groupByBucket(players), [players])
  return (
    <div>
      <p
        className="text-[10px] font-mono uppercase tracking-[0.22em] mb-2"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
      >
        — Roster
      </p>
      <div className="space-y-3">
        {buckets.map((b) => (
          <div key={b.label}>
            <div
              className="text-[9px] font-mono uppercase tracking-[0.22em] mb-1"
              style={{ color: 'color-mix(in srgb, var(--vmy-bone) 40%, transparent)' }}
            >
              {b.label} · {b.players.length}
            </div>
            <ul className="space-y-1">
              {b.players.map((p) => (
                <SquadPlayerRow key={p.playerEntityId} player={p} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

interface PositionBucket {
  label: string
  players: FifaWc26SquadPlayer[]
}

const POSITION_BUCKETS: { label: string; matches: (s: string) => boolean }[] = [
  { label: 'Goalkeepers', matches: (s) => /^(gk|goalkeeper)/i.test(s) },
  { label: 'Defenders', matches: (s) => /(def|back|cb|lb|rb|wb)/i.test(s) },
  { label: 'Midfielders', matches: (s) => /(mid|cm|cdm|cam|dm|am)/i.test(s) },
  { label: 'Forwards', matches: (s) => /(fwd|forward|striker|st|lw|rw|winger)/i.test(s) },
]

function bucketFor(player: FifaWc26SquadPlayer): string {
  const raw = (player.position ?? player.primaryPosition ?? '').trim()
  for (const b of POSITION_BUCKETS) if (raw && b.matches(raw)) return b.label
  return 'Other'
}

function groupByBucket(players: FifaWc26SquadPlayer[]): PositionBucket[] {
  const order = [...POSITION_BUCKETS.map((b) => b.label), 'Other']
  const map = new Map<string, FifaWc26SquadPlayer[]>()
  for (const p of players) {
    const k = bucketFor(p)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(p)
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const ja = a.jersey ?? Number.POSITIVE_INFINITY
      const jb = b.jersey ?? Number.POSITIVE_INFINITY
      if (ja !== jb) return ja - jb
      return a.playerName.localeCompare(b.playerName)
    })
  }
  return order
    .filter((k) => map.has(k))
    .map((k) => ({ label: k, players: map.get(k)! }))
}

function SquadPlayerRow({ player }: { player: FifaWc26SquadPlayer }) {
  const clubLabel = player.clubName ?? player.clubNameRaw ?? '—'
  const isUnmatched = !player.clubEntityId && !!player.clubNameRaw
  const roleBadge = player.role === 'captain' ? 'C' : player.role === 'vice_captain' ? 'VC' : null
  return (
    <li
      className="rounded-md px-2.5 py-1.5 flex items-baseline gap-2"
      style={{
        background: 'color-mix(in srgb, var(--vmy-bone) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--vmy-bone) 6%, transparent)',
      }}
    >
      <span
        className="text-[10px] font-mono w-5 text-right shrink-0"
        style={{
          color: 'color-mix(in srgb, var(--vmy-bone) 55%, transparent)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {player.jersey ?? '—'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-sm truncate leading-tight"
            style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
          >
            {player.playerName}
          </span>
          {roleBadge && (
            <span
              className="text-[8.5px] font-mono px-1 rounded shrink-0"
              style={{
                background: 'color-mix(in srgb, var(--vmy-ember) 24%, transparent)',
                border: '1px solid color-mix(in srgb, var(--vmy-ember) 60%, transparent)',
                color: 'var(--vmy-bone)',
              }}
            >
              {roleBadge}
            </span>
          )}
        </div>
        <div
          className="text-[10px] font-mono mt-0.5 truncate"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
        >
          {clubLabel}
          {isUnmatched && (
            <span
              className="ml-1.5"
              style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
            >
              · unverified
            </span>
          )}
        </div>
      </div>
      {player.position && (
        <span
          className="text-[9px] font-mono uppercase tracking-[0.18em] shrink-0"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
        >
          {player.position}
        </span>
      )}
    </li>
  )
}
