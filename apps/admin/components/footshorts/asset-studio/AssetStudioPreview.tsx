'use client'

import {
  MatchCard,
  MatchTile,
  MatchRow,
  TeamFormStrip,
  StandingsTable,
  StandingsOverMatchdays,
  Bracket,
  Crest,
} from '@vismay/footshorts-viz/web'
import type { ThemeName } from '@footshorts/brand'
import { themeStyleVars } from './themeVars'
import type { PreviewData } from './previewData'

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
 * The full viz component set rendered under a single footshorts theme, with the
 * picked color injected as the brand accent. Drop one of these per theme to see
 * the color across themes.
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
    </section>
  )
}
