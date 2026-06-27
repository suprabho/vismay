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

/**
 * One in-match event from the `fixture_events` table (populated by the events
 * worker from API-Football). Goals carry the scorer in `player_name` and the
 * assister in `assist_name`; cards/subs reuse the same shape. `side` places the
 * event on the home/away half of a timeline even when the team isn't a tracked
 * entity (`team_id` null).
 */
export type FixtureEventType = 'goal' | 'card' | 'subst' | 'var'

export type FixtureEvent = {
  id: string
  fixture_id: string
  team_id: string | null
  side: 'home' | 'away' | null
  minute: number
  extra_minute: number | null
  type: FixtureEventType
  // e.g. "Normal Goal" | "Own Goal" | "Penalty" | "Yellow Card" | "Red Card"
  detail: string | null
  player_name: string | null
  assist_name: string | null
}

/**
 * Event-type narrowing for the timeline. 'all' shows goals + cards + subs;
 * otherwise restrict to one FixtureEventType. (`'var'` is never rendered, so it
 * isn't an option.) Used by MatchTimeline's `filter` prop, the match-page tabs,
 * and the fs:match-timeline module config.
 */
export type EventTypeFilter = 'all' | 'goal' | 'card' | 'subst'

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
 * One point on a team's league-position trajectory across a season.
 * Mirrors f1-viz's `LapPosition` — kept here so the football vertical owns its
 * own data contract for the `fs:standings-over-matchdays` chart.
 */
export type MatchdayPosition = {
  /** Matchday number, 1-based (MD1..MD38). */
  matchday: number
  /** League position after this matchday, 1 = top of the table. */
  position: number
  /** Optional cumulative points after this matchday (reserved for labels/tooltips). */
  points?: number
}

/**
 * One team's position-over-matchdays trajectory — rendered as a single polyline
 * by the `fs:standings-over-matchdays` chart (one lane per team). Analogous to
 * f1-viz's `DriverLane`.
 */
export type TeamLane = {
  team_id: string
  /** Display name shown in the legend, e.g. "Manchester United". */
  team_name: string
  /** Optional short code for a compact legend, e.g. "MUN". */
  team_code?: string | null
  /** Hex color for the polyline; usually the club's primary brand color. */
  color: string
  /** Optional crest URL; rendered at the lane's latest point (and resolved from
   *  the bundled team palette when omitted — see Crest.tsx). */
  crest_url?: string | null
  /**
   * When true, this lane is emphasised — drawn thicker, fully opaque, and on top
   * of the others — while every *other* lane (and its legend entry) is dimmed.
   * If no lane sets this, all lanes render at full opacity (backward compatible).
   */
  highlight?: boolean
  /**
   * Explicit polyline stroke width in SVG user units. Overrides both the default
   * (1.5) and the `highlight` bump. Omit to keep the default (backward compatible).
   */
  lineWidth?: number
  points: MatchdayPosition[]
}

/**
/**
 * One competitor slot in a knockout tie.
 *
 * Knockout brackets are often *incomplete*: before a tie's participants are
 * decided, a slot holds either a qualification descriptor ("Winner Group I",
 * "3rd A/C/D/F", "Runner-up K") or is entirely unknown. The fixture-derived
 * path only ever produces `team` slots; the direct authoring path
 * (`buildStaticBracket`) is the one that emits `placeholder` / `tbd` so a draw
 * can be drawn before every entrant is known.
 *
 *   - `team`        — a confirmed entrant (crest + name, optional aggregate score)
 *   - `placeholder` — an unresolved qualification descriptor, shown dimmed
 *   - `tbd`         — fully unknown; rendered as a faint blank slot
 */
export type BracketSlot =
  | {
      kind: 'team'
      team: FixtureTeamRef
      name: string
      score?: number | null
      winner?: boolean
    }
  | { kind: 'placeholder'; label: string }
  | { kind: 'tbd' }

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
  /**
   * Stable identity for React keys. The fixture path leaves this undefined and
   * keys off the legs' ids; the static/incomplete path sets it because those
   * ties have no legs (an all-TBD round would otherwise collide on an empty
   * key).
   */
  id?: string
  /**
   * Per-slot detail for incomplete brackets. When present the renderers draw
   * from these (team / placeholder / tbd) instead of `teamA`/`teamB`; when
   * absent (the fixture path) they fall back to the team fields above, so this
   * is fully backward compatible.
   */
  slotA?: BracketSlot
  slotB?: BracketSlot
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
