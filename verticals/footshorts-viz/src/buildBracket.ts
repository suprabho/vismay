import type {
  Bracket,
  BracketRound,
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

  return {
    stage,
    legs: sortedLegs,
    teamA,
    teamB,
    teamAName,
    teamBName,
    aggregate,
    winnerTeamId,
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
 * seeds the rounds with TBD placeholders (null team refs); rendering those as a
 * tree produces an empty, broken-looking bracket, so callers use this to fall
 * back to a schedule view until real matchups appear.
 */
export function isBracketDrawn(bracket: Bracket | null): boolean {
  if (!bracket) return false
  return bracket.rounds.some((round) =>
    round.ties.some((tie) => !!tie.teamA && !!tie.teamB),
  )
}
