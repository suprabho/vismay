import { Text, View } from 'react-native'
import type { Bracket as BracketModel, BracketSlot, BracketTie, FixtureRow } from '../types'
import { stageLabel } from '../stageLabel'
import { MatchRow } from './MatchRow'

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

function SlotRow({ slot }: { slot: BracketSlot }) {
  if (slot.kind !== 'team') {
    const label = slot.kind === 'placeholder' ? slot.label : 'TBD'
    return (
      <View className="px-3 py-2">
        <Text className="text-[13px] italic text-text/40">{label}</Text>
      </View>
    )
  }
  return (
    <View className="flex-row items-center px-3 py-2">
      <Text className={`flex-1 text-[13px] ${slot.winner ? 'font-semibold text-text' : 'text-text/75'}`}>
        {slot.name}
      </Text>
      {slot.score != null ? (
        <Text className={`text-[13px] ${slot.winner ? 'font-semibold text-text' : 'text-text/75'}`}>
          {slot.score}
        </Text>
      ) : null}
    </View>
  )
}

// Incomplete/static ties have no legs — render the two slots directly.
function SlotTieCard({ tie }: { tie: BracketTie }) {
  return (
    <View className="overflow-hidden rounded-lg border border-white/20 bg-white/10">
      <SlotRow slot={tie.slotA!} />
      <View className="border-t border-white/15" />
      <SlotRow slot={tie.slotB!} />
    </View>
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
    <View className="overflow-hidden rounded-lg border border-white/20 bg-white/10">
      {showAggregate ? (
        <>
          {winnerName ? (
            <View className="border-t border-white/15 bg-white/5 px-3 py-1.5">
              <Text className="text-[11px] font-semibold text-text/80">
                {winnerName} advance
              </Text>
            </View>
          ) : null}
          <MatchRow fixture={aggregateFixture(tie)} variant="expanded" />
        </>
      ) : null}

      {tie.legs.map((leg, i) => (
        // Dividers above subsequent legs only. Leg 0 has either the aggregate
        // MatchRow above it (whose own bottom border draws the line) or the
        // card edge above it (no divider needed).
        <View key={leg.id} className={i > 0 ? 'border-t border-white/15' : ''}>
          {tie.legs.length > 1 ? (
            <Text
              className="px-3 pt-1.5 text-[10px] font-semibold uppercase text-text/55"
              style={{ letterSpacing: 1.2 }}
            >
              Leg {i + 1}
            </Text>
          ) : null}
          <MatchRow fixture={leg} />
        </View>
      ))}
    </View>
  )
}

export function Bracket({ bracket }: Props) {
  if (bracket.rounds.length === 0) return null

  return (
    <View style={{ gap: 20 }}>
      {bracket.rounds.map((round) => (
        <View key={round.stage}>
          <Text
            className="mb-2.5 text-[11px] font-bold uppercase text-text/80"
            style={{ letterSpacing: 1.8 }}
          >
            {stageLabel(round.stage)}
          </Text>
          <View style={{ gap: 8 }}>
            {round.ties.map((tie) => (
              <TieCard key={tie.id ?? tie.legs.map((l) => l.id).join('|')} tie={tie} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}
