/**
 * Football-domain types shared across @vismay/footshort-viz components.
 *
 * Mirrors the Supabase row shapes used by Footshort's queries today. Kept
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
} | null

export type FixtureRow = {
  id: string
  competition_slug: string
  season: string
  matchday: number | null
  stage: string | null
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
}
