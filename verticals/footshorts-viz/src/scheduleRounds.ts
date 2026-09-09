import type { FixtureRow } from './types'
import { isKnockoutStage, stageLabel, stageRank } from './stageLabel'
import { compareSeasons } from './season'

/**
 * One "round" of a competition schedule — a league/group matchday or a knockout
 * stage — with its fixtures sorted by kickoff. Used by the competition hub to
 * render "who plays who, and when" grouped by round, which is the meaningful
 * view for a tournament whose knockout draw isn't set yet (a bracket can't show
 * matchups that don't exist).
 */
export type ScheduleRound = {
  key: string
  label: string
  /** Season the round belongs to, e.g. "26-27". */
  season: string
  fixtures: FixtureRow[]
  /** Earliest kickoff in the round (ISO) — used for display, not ordering. */
  startsAt: string
}

// Sort key: knockout stages order by their canonical rank; league/group rounds
// sort ahead of knockouts (group rank) and break ties on matchday number.
function roundOrder(f: FixtureRow): [number, number] {
  if (isKnockoutStage(f.stage)) return [stageRank(f.stage!), 0]
  const base = f.stage ? stageRank(f.stage) : 0
  return [base, f.matchday ?? 0]
}

// Season leads the key so "Matchday 1" of 26-27 can never absorb "Matchday 1"
// of 25-26. The fixtures table keeps every season it has ever ingested, so a
// caller that forgets to scope its query would otherwise render one round made
// of three seasons' matches.
function roundKey(f: FixtureRow): string {
  const season = f.season ?? ''
  if (isKnockoutStage(f.stage)) return `${season}:k:${f.stage}`
  if (f.matchday != null) return `${season}:m:${f.stage ?? ''}:${f.matchday}`
  if (f.stage) return `${season}:s:${f.stage}`
  return `${season}:other`
}

function roundLabel(f: FixtureRow): string {
  if (isKnockoutStage(f.stage)) return stageLabel(f.stage!)
  if (f.matchday != null) return `Matchday ${f.matchday}`
  if (f.stage) return stageLabel(f.stage)
  return 'Fixtures'
}

/**
 * Bucket a flat fixture list into ordered rounds (group/league matchdays first,
 * then knockout stages earliest → latest). Within a round fixtures sort by
 * kickoff. Rows with both teams unresolved (TBD knockout placeholders) are kept
 * — "Round of 16 · 11 Jul, TBD vs TBD" is still useful schedule information.
 */
export function groupFixturesByRound(fixtures: FixtureRow[]): ScheduleRound[] {
  const buckets = new Map<string, { order: [number, number]; fixtures: FixtureRow[] }>()
  for (const f of fixtures) {
    const key = roundKey(f)
    const bucket = buckets.get(key)
    if (bucket) bucket.fixtures.push(f)
    else buckets.set(key, { order: roundOrder(f), fixtures: [f] })
  }

  return Array.from(buckets.entries())
    .map(([key, { order, fixtures }]) => {
      const sorted = [...fixtures].sort((a, b) =>
        a.kickoff_at.localeCompare(b.kickoff_at),
      )
      return {
        key,
        order,
        label: roundLabel(sorted[0]!),
        season: sorted[0]!.season ?? '',
        fixtures: sorted,
        startsAt: sorted[0]!.kickoff_at,
      }
    })
    .sort(
      (a, b) =>
        // Newest season first, so a list that does span seasons opens on the
        // current one instead of burying it under an archived campaign.
        compareSeasons(b.season, a.season) ||
        a.order[0] - b.order[0] ||
        a.order[1] - b.order[1] ||
        a.startsAt.localeCompare(b.startsAt),
    )
    .map(({ key, label, season, fixtures, startsAt }) => ({ key, label, season, fixtures, startsAt }))
}
