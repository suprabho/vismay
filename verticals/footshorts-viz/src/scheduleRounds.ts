import type { FixtureRow } from './types'
import { isKnockoutStage, stageLabel, stageRank } from './stageLabel'

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

function roundKey(f: FixtureRow): string {
  if (isKnockoutStage(f.stage)) return `k:${f.stage}`
  if (f.matchday != null) return `m:${f.stage ?? ''}:${f.matchday}`
  if (f.stage) return `s:${f.stage}`
  return 'other'
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
      return { key, order, label: roundLabel(sorted[0]!), fixtures: sorted, startsAt: sorted[0]!.kickoff_at }
    })
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.startsAt.localeCompare(b.startsAt))
    .map(({ key, label, fixtures, startsAt }) => ({ key, label, fixtures, startsAt }))
}
