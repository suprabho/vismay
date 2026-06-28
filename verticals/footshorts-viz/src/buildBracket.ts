import type {
  Bracket,
  BracketRound,
  BracketSlot,
  BracketTie,
  FixtureRow,
  FixtureTeamRef,
} from './types'
import { isKnockoutStage, stageRank } from './stageLabel'

// Stable pair key from two team-side identifiers, regardless of who was home.
// Falls back to the raw team_name when an entity row isn't seeded so that
// early-round qualifying ties still pair correctly.
function pairKey(
  homeId: string | null,
  awayId: string | null,
  homeName: string | null,
  awayName: string | null,
): string | null {
  const a = homeId ?? (homeName ? `name:${homeName}` : null)
  const b = awayId ?? (awayName ? `name:${awayName}` : null)
  if (!a || !b) return null
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function teamRefId(ref: FixtureTeamRef): string | null {
  return ref?.id ?? null
}

function teamRefName(ref: FixtureTeamRef, fallback: string | null): string {
  return ref?.name ?? fallback ?? 'TBD'
}

function sumLeg(
  leg: FixtureRow,
  teamAId: string | null,
  teamAName: string,
): { a: number; b: number } | null {
  if (leg.status !== 'finished') return null
  if (leg.home_score == null || leg.away_score == null) return null
  const legHomeId = teamRefId(leg.home)
  const legHomeName = leg.home?.name ?? leg.home_team_name ?? ''
  const aIsHome = teamAId
    ? legHomeId === teamAId
    : legHomeName === teamAName
  if (aIsHome) return { a: leg.home_score, b: leg.away_score }
  return { a: leg.away_score, b: leg.home_score }
}

// Turn one side of a tie into a render slot. A confirmed entry becomes a `team`
// slot; an unknown side falls back to whatever the fixture carries — a
// descriptive name ("Winner Group A", seeded by football-data.org before the
// draw) becomes a `placeholder`, and a blank/literal-TBD side becomes `tbd`.
// This is what lets the bracket render as a real (if incomplete) tree before the
// matchups are decided, instead of a row of "TBD vs TBD" matches.
function buildSlot(
  ref: FixtureTeamRef,
  rawName: string | null,
  score: number | null,
  winner: boolean,
): BracketSlot {
  if (ref) return { kind: 'team', team: ref, name: ref.name, score, winner }
  const label = rawName?.trim()
  if (label && label.toUpperCase() !== 'TBD') return { kind: 'placeholder', label }
  return { kind: 'tbd' }
}

function buildTie(stage: string, legs: FixtureRow[]): BracketTie {
  const sortedLegs = [...legs].sort((x, y) =>
    x.kickoff_at.localeCompare(y.kickoff_at),
  )
  const leg1 = sortedLegs[0]!

  const teamA = leg1.home
  const teamB = leg1.away
  const teamAName = teamRefName(teamA, leg1.home_team_name)
  const teamBName = teamRefName(teamB, leg1.away_team_name)
  const teamAId = teamRefId(teamA)

  let aggA = 0
  let aggB = 0
  let sawAnyFinished = false
  let allFinished = true
  for (const leg of sortedLegs) {
    const s = sumLeg(leg, teamAId, teamAName)
    if (s) {
      aggA += s.a
      aggB += s.b
      sawAnyFinished = true
    } else {
      allFinished = false
    }
  }

  const aggregate = sawAnyFinished ? { a: aggA, b: aggB } : null

  let winnerTeamId: string | null = null
  if (allFinished && aggregate && aggregate.a !== aggregate.b) {
    winnerTeamId =
      aggregate.a > aggregate.b ? teamAId : teamRefId(teamB)
  }

  // A tie is "drawn" once both participants are confirmed teams. Until then it's
  // rendered from explicit slots (team / placeholder / TBD) rather than as
  // matches: a side may be a real team, a qualification descriptor, or unknown.
  const teamBId = teamRefId(teamB)
  const anyUnknown = !teamA || !teamB
  const bothUnknown = !teamA && !teamB
  const slots = anyUnknown
    ? {
        slotA: buildSlot(
          teamA,
          leg1.home_team_name,
          aggregate ? aggregate.a : null,
          winnerTeamId != null && winnerTeamId === teamAId,
        ),
        slotB: buildSlot(
          teamB,
          leg1.away_team_name,
          aggregate ? aggregate.b : null,
          winnerTeamId != null && winnerTeamId === teamBId,
        ),
      }
    : null

  return {
    stage,
    // When neither side is known there's no match to show — drop the legs so the
    // renderers fall through to the compact slot card (keyed off `id`). A tie
    // with at least one confirmed team keeps its legs and renders as matches.
    legs: bothUnknown ? [] : sortedLegs,
    teamA,
    teamB,
    teamAName,
    teamBName,
    aggregate,
    winnerTeamId,
    ...(bothUnknown ? { id: leg1.id } : {}),
    ...(slots ?? {}),
  }
}

/**
 * Group a flat fixture list into a bracket. Pairs legs by unordered team pair
 * within each stage. Fixtures without a stage are ignored (those belong to a
 * league/group phase, not a knockout). Returns null when no knockout fixtures
 * are present.
 */
export function buildBracket(fixtures: FixtureRow[]): Bracket | null {
  const knockouts = fixtures.filter((f) => isKnockoutStage(f.stage))
  if (knockouts.length === 0) return null

  const byStage = new Map<string, FixtureRow[]>()
  for (const f of knockouts) {
    const stage = f.stage!
    const list = byStage.get(stage) ?? []
    list.push(f)
    byStage.set(stage, list)
  }

  const rounds: BracketRound[] = []
  for (const [stage, stageFixtures] of byStage.entries()) {
    const tieGroups = new Map<string, FixtureRow[]>()
    const unpairable: FixtureRow[] = []
    for (const f of stageFixtures) {
      const key = pairKey(
        teamRefId(f.home),
        teamRefId(f.away),
        f.home_team_name,
        f.away_team_name,
      )
      if (!key) {
        unpairable.push(f)
        continue
      }
      const list = tieGroups.get(key) ?? []
      list.push(f)
      tieGroups.set(key, list)
    }

    const ties: BracketTie[] = []
    for (const legs of tieGroups.values()) {
      ties.push(buildTie(stage, legs))
    }
    for (const lone of unpairable) {
      ties.push(buildTie(stage, [lone]))
    }

    ties.sort((x, y) =>
      x.legs[0]!.kickoff_at.localeCompare(y.legs[0]!.kickoff_at),
    )
    rounds.push({ stage, ties })
  }

  rounds.sort((x, y) => stageRank(x.stage) - stageRank(y.stage))

  const first = knockouts[0]!
  return {
    competition_slug: first.competition_slug,
    season: first.season,
    rounds,
  }
}

/**
 * Whether a bracket's draw is actually set — i.e. at least one tie has both
 * teams known. Before a tournament's knockout draw exists, football-data.org
 * seeds the rounds with TBD placeholders (null team refs).
 *
 * The renderers no longer need this to avoid a broken view — `buildBracket` now
 * emits explicit `slotA`/`slotB` (team / placeholder / TBD) for unresolved ties,
 * so an undrawn bracket draws as a proper incomplete tree. Kept as a predicate
 * for callers that still want to distinguish "draw is live" from "still TBD"
 * (e.g. to choose a headline or skip a share card).
 */
export function isBracketDrawn(bracket: Bracket | null): boolean {
  if (!bracket) return false
  return bracket.rounds.some((round) =>
    round.ties.some((tie) => !!tie.teamA && !!tie.teamB),
  )
}
