'use client'

import {
  MatchCard,
  MatchTile,
  MatchRow,
  TeamFormStrip,
  StandingsTable,
  StandingsOverMatchdays,
  Bracket,
  BracketTree,
  Crest,
  darkenHex,
} from '@vismay/footshorts-viz/web'
import type { ThemeName } from '@footshorts/brand'
import { themeStyleVars } from './themeVars'
import type { PreviewData, TeamPreviewData, LeaguePreviewData } from './previewData'

const COMP_SLUG = 'asset-preview'

/** One labeled cell wrapping a viz component. */
function Cell({
  title,
  span,
  children,
}: {
  title: string
  span?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={span ? 'sm:col-span-2' : undefined}>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </div>
      {children}
    </div>
  )
}

/**
 * The viz set rendered under a single footshorts theme with the picked color
 * injected as the brand accent. Branches on entity kind: a team shows
 * participant surfaces, a league shows the competition frame.
 */
export function AssetStudioPreview({
  data,
  themeName,
  accent,
  label,
}: {
  data: PreviewData
  themeName: ThemeName
  accent: string
  label: string
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-bg p-4 text-text"
      style={themeStyleVars(themeName, accent)}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {accent}
        </span>
      </div>

      {data.kind === 'league' ? <LeagueCells data={data} /> : <TeamCells data={data} />}
    </section>
  )
}

// ── team: the color as a participant identity ─────────────────────────────────

function TeamCells({ data }: { data: TeamPreviewData }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Cell title="Brand badge">
        <div className="flex items-end gap-4">
          <Crest team={data.badge.team} color={data.badge.color} size={64} />
          <Crest team={data.badge.team} color={data.badge.color} size={40} />
          <Crest team={data.badge.team} color={data.badge.color} size={28} />
          <span
            className="h-16 w-16 rounded-xl border border-white/15"
            style={{ background: data.badge.color }}
          />
        </div>
      </Cell>

      <Cell title="Match tile">
        <MatchTile fixture={data.tileFixture} />
      </Cell>

      <Cell title="Match card · score">
        <MatchCard config={data.matchCardScore} />
      </Cell>

      <Cell title="Match card · horizontal">
        <MatchCard config={data.matchCardHorizontal} />
      </Cell>

      <Cell title="Match row">
        <div className="rounded-xl border border-border bg-surface">
          <MatchRow fixture={data.rowFixture} variant="expanded" />
        </div>
      </Cell>

      <Cell title="Team form · last 5">
        <TeamFormStrip
          fixtures={data.formFixtures}
          teamId={data.teamId}
          layout="grid"
          columns={5}
          rows={1}
        />
      </Cell>

      <Cell title="Standings table">
        <StandingsTable rows={data.standingsRows} />
      </Cell>

      {data.bracket ? (
        <Cell title="Knockout bracket">
          <Bracket bracket={data.bracket} />
        </Cell>
      ) : null}

      <Cell title="League position by matchday" span>
        <StandingsOverMatchdays
          competitionLabel={data.chart.competitionLabel}
          lanes={data.chart.lanes}
          animate={false}
        />
      </Cell>
    </div>
  )
}

// ── league: the color as the competition frame ────────────────────────────────

function LeagueCells({ data }: { data: LeaguePreviewData }) {
  const gradient = `linear-gradient(135deg, ${data.color} 0%, ${darkenHex(data.color, 0.4)} 100%)`
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Cell title="League tile">
        <div
          className="group relative aspect-[4/3] max-w-[240px] overflow-hidden rounded-xl border border-border shadow-lg"
          style={{ background: gradient }}
        >
          <div className="flex h-full flex-col items-center p-4">
            <div className="flex flex-1 items-center justify-center">
              {data.crestUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.crestUrl} alt="" className="h-full max-h-24 w-auto max-w-[80%] object-contain" />
              ) : (
                <span className="text-2xl font-bold text-white/90">{data.name.charAt(0)}</span>
              )}
            </div>
            <div className="w-full text-center">
              <div className="truncate text-sm font-bold leading-tight text-white">{data.name}</div>
              {data.country ? (
                <div className="truncate text-[11px] text-white/75">{data.country}</div>
              ) : null}
            </div>
          </div>
        </div>
      </Cell>

      <Cell title="Feed placeholder (no image)">
        <div
          className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border shadow-lg"
          style={{ background: gradient }}
        >
          {data.crestUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.crestUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 object-contain opacity-30"
            />
          ) : null}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="text-[15px] font-bold leading-tight text-white">{data.feedHeadline}</div>
          </div>
        </div>
      </Cell>

      <Cell title="Match card · competition accent">
        <MatchCard config={data.matchCard} />
      </Cell>

      <Cell title="Follow CTA">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: data.color }}>
            Matchday 32 · Upcoming
          </span>
          <span className="text-sm font-semibold text-text">{data.name}</span>
          <span className="text-xs font-medium" style={{ color: data.color }}>
            View competition →
          </span>
        </div>
      </Cell>

      {data.bracket ? (
        <Cell title="Knockout bracket · emblem" span>
          <BracketTree
            bracket={data.bracket}
            competitionSlug={COMP_SLUG}
            competitionColor={data.color}
            title={data.name}
          />
        </Cell>
      ) : null}
    </div>
  )
}
