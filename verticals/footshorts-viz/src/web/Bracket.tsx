'use client'

import type { Bracket as BracketModel, BracketSlot, BracketTie, FixtureRow } from '../types'
import { stageLabel } from '../stageLabel'
import { MatchRow } from './MatchRow'
import { Crest } from '../data/Crest'

type Props = { bracket: BracketModel }

// Synthesise a "fixture" representing the aggregate so we can render it
// through the same expanded MatchRow used for actual matches. The kickoff_at
// is the last leg's — that's when the tie was decided.
function aggregateFixture(tie: BracketTie): FixtureRow {
  const lastLeg = tie.legs[tie.legs.length - 1]!
  return {
    id: `${lastLeg.id}-agg`,
    competition_slug: lastLeg.competition_slug,
    season: lastLeg.season,
    matchday: null,
    stage: tie.stage,
    phase: 'knockout',
    kickoff_at: lastLeg.kickoff_at,
    status: 'finished',
    home_score: tie.aggregate!.a,
    away_score: tie.aggregate!.b,
    home_team_name: tie.teamAName,
    away_team_name: tie.teamBName,
    home: tie.teamA,
    away: tie.teamB,
  }
}

// One stacked row in a slot-based (incomplete) tie card.
function SlotRow({ slot }: { slot: BracketSlot }) {
  if (slot.kind !== 'team') {
    const label = slot.kind === 'placeholder' ? slot.label : 'TBD'
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="shrink-0 rounded-full border border-dashed border-white/25"
          style={{ width: 20, height: 20 }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[13px] italic text-text/40">{label}</span>
      </div>
    )
  }
  const slug = slot.team?.slug ?? slot.name
  const tone = slot.winner ? 'font-semibold text-text' : 'text-text/75'
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Crest team={slug} crestUrl={slot.team?.crest_url ?? undefined} size={20} className="shrink-0 object-contain" />
      <span className={`min-w-0 flex-1 truncate text-[13px] ${tone}`}>{slot.name}</span>
      {slot.score != null ? (
        <span className={`tabular-nums text-[13px] ${tone}`}>{slot.score}</span>
      ) : null}
    </div>
  )
}

// Incomplete/static ties have no legs to render through MatchRow — just two
// slots (team / placeholder / TBD). Drawn as a compact two-row card.
function SlotTieCard({ tie }: { tie: BracketTie }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-white/20 bg-white/10">
      <SlotRow slot={tie.slotA!} />
      <div className="border-t border-white/15" />
      <SlotRow slot={tie.slotB!} />
    </div>
  )
}

export function TieCard({ tie }: { tie: BracketTie }) {
  if (tie.slotA && tie.slotB && tie.legs.length === 0) {
    return <SlotTieCard tie={tie} />
  }
  const showAggregate = tie.legs.length >= 2 && tie.aggregate !== null
  const winnerName =
    tie.winnerTeamId === tie.teamA?.id
      ? tie.teamAName
      : tie.winnerTeamId === tie.teamB?.id
        ? tie.teamBName
        : null

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-white/20 bg-white/10">
      {showAggregate ? (
        <>
          {winnerName ? (
            <div className="border-t border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-text/80">
              {winnerName} advance
            </div>
          ) : null}
          <MatchRow fixture={aggregateFixture(tie)} variant="expanded" />
        </>
      ) : null}

      {tie.legs.map((leg, i) => (
        // Dividers above subsequent legs only. Leg 0 has either the aggregate
        // MatchRow above it (whose own bottom border draws the line) or the
        // card edge above it (no divider needed).
        <div
          key={leg.id}
          className={i > 0 ? 'border-t border-white/15' : ''}
        >
          {tie.legs.length > 1 ? (
            <div className="px-3 pt-1.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-text/55">
              Leg {i + 1}
            </div>
          ) : null}
          <MatchRow fixture={leg} />
        </div>
      ))}

      
    </div>
  )
}

export function Bracket({ bracket }: Props) {
  if (bracket.rounds.length === 0) return null

  return (
    <div className="flex flex-col gap-5">
      {bracket.rounds.map((round) => (
        <section key={round.stage}>
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.8px] text-text/80">
            {stageLabel(round.stage)}
          </div>
          <div className="flex flex-col gap-2">
            {round.ties.map((tie) => (
              <TieCard
                key={tie.id ?? tie.legs.map((l) => l.id).join('|')}
                tie={tie}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
