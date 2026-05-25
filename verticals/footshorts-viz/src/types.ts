/**
 * Football-domain types shared across @vismay/footshorts-viz components.
 *
 * Mirrors the Supabase row shapes used by Footshorts's queries today. Kept
 * here so the vertical owns the football data contract and presentational
 * components can be consumed from any app without reaching back into a
 * specific app's lib/. The app's hooks (useFixtures, useStandings) re-export
 * these types so existing call sites keep working.
 */

export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'

export type FixtureTeamRef = {
  id: string
  slug: string
  name: string
  crest_url: string | null
  // Optional brand color. Consumers that include `primary_color` in their
  // entities select (e.g. the snapshot strip / MatchTile) can carry team
  // theming through the standard FixtureRow shape without a parallel type.
  primary_color?: string | null
} | null

export type CompetitionPhase = 'league' | 'group' | 'knockout'

export type FixtureRow = {
  id: string
  competition_slug: string
  season: string
  matchday: number | null
  stage: string | null
  // Populated by the 20260521 migration. Optional because consumers may not
  // select it; when present, it tells us whether this fixture belongs to a
  // league round, a group-stage match, or a knockout tie.
  phase?: CompetitionPhase | null
  kickoff_at: string
  status: FixtureStatus
  home_score: number | null
  away_score: number | null
  home_team_name: string | null
  away_team_name: string | null
  home: FixtureTeamRef
  away: FixtureTeamRef
}

export type StandingTeamRef = {
  id: string
  slug: string
  name: string
  crest_url: string | null
} | null

export type StandingRow = {
  competition_slug: string
  season: string
  team_id: string
  position: number
  played: number
  won: number
  draw: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  form: string | null
  team: StandingTeamRef
  // Populated by the 20260521 migration. Optional so consumers that don't
  // select them still typecheck; defaults at the DB are 'league' / ''.
  phase?: CompetitionPhase
  group_label?: string
}

/**
 * A knockout tie: one or two legs between the same pair of teams in the same
 * stage. We don't have a `tie_id` on fixtures — buildBracket pairs legs by
 * unordered team pair within (competition_slug, season, stage).
 */
export type BracketTie = {
  stage: string
  legs: FixtureRow[]
  // Canonical team A/B assignment: A is the team that was *home* in leg 1.
  // The aggregate score is reported from A's and B's perspectives so the UI
  // doesn't need to re-derive which leg was where.
  teamA: FixtureTeamRef
  teamB: FixtureTeamRef
  teamAName: string
  teamBName: string
  aggregate: { a: number; b: number } | null
  winnerTeamId: string | null
}

export type BracketRound = {
  stage: string
  ties: BracketTie[]
}

export type Bracket = {
  competition_slug: string
  season: string
  rounds: BracketRound[]
}
