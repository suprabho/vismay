'use client'

import { useEffect, useState } from 'react'
import DetailSheet from '@/components/DetailSheet'
import type { FifaWc26TeamProfile } from '@/lib/fifa-wc26'
import type { ShortfootFixture, ShortfootNewsItem } from '@/lib/shortfoot'

interface Props {
  code: string
  onClose: () => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: FifaWc26TeamProfile }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export default function TeamDetail({ code, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    fetch(`/api/fifa-wc26/team/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState({ kind: 'missing' })
          return
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as FifaWc26TeamProfile
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <DetailSheet>
      <Header
        title={state.kind === 'ready' ? state.data.name : code}
        rank={state.kind === 'ready' ? state.data.fifaRanking : null}
        subtitle={state.kind === 'ready' ? state.data.confederation : undefined}
        onClose={onClose}
      />
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
        {state.kind === 'ready' && <Profile data={state.data} />}
      </div>
    </DetailSheet>
  )
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

function Profile({ data }: { data: FifaWc26TeamProfile }) {
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

      {data.shortfoot.fixtures.length > 0 && (
        <Fixtures fixtures={data.shortfoot.fixtures} teamName={data.name} />
      )}

      {data.shortfoot.news.length > 0 && <News items={data.shortfoot.news} />}

      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        Squad values: Transfermarkt (Oct–Nov 2025). GDP / population: IMF & World Bank 2024.
        Democracy Index: EIU 2024. FIFA rank: Apr 2026. GHI 2025, WHR 2025.
        {(data.shortfoot.fixtures.length > 0 || data.shortfoot.news.length > 0) && (
          <> Fixtures: football-data.org. News summaries: shortfoot RSS via Gemini.</>
        )}
      </p>
    </>
  )
}

function Fixtures({
  fixtures,
  teamName,
}: {
  fixtures: ShortfootFixture[]
  teamName: string
}) {
  return (
    <div>
      <p
        className="text-[10px] font-mono uppercase tracking-[0.22em] mb-2"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
      >
        — World Cup fixtures
      </p>
      <ul className="space-y-2">
        {fixtures.map((f) => (
          <FixtureRow key={f.id} fixture={f} teamName={teamName} />
        ))}
      </ul>
    </div>
  )
}

function FixtureRow({
  fixture,
  teamName,
}: {
  fixture: ShortfootFixture
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

function News({ items }: { items: ShortfootNewsItem[] }) {
  return (
    <div>
      <p
        className="text-[10px] font-mono uppercase tracking-[0.22em] mb-2"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
      >
        — Recent news
      </p>
      <ul className="space-y-3">
        {items.map((n) => {
          const date = new Date(n.publishedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
          return (
            <li key={n.id}>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5 font-mono">
                  {date}
                  {n.publisher && <span className="ml-2">· {n.publisher}</span>}
                </div>
                <div className="text-sm text-zinc-200 group-hover:text-amber-200 leading-snug">
                  {n.title}
                </div>
                {n.summary && (
                  <div className="text-xs text-zinc-500 mt-1 leading-snug line-clamp-3">
                    {n.summary}
                  </div>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </div>
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
