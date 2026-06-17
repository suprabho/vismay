/**
 * Pure converters: real football rows → footshorts viz-module config blocks.
 *
 * The footshorts story configs embed three data-driven modules whose `rows` /
 * `fixtures` were, until now, hand-authored (see
 * `paris-road-to-budapest.config.yaml`). These builders turn the rows we read
 * from Supabase (via `footshortsData`) into the exact config shapes the modules
 * expect, so the admin can drop a real standings table / match card / bracket
 * into a story instead of typing one by hand.
 *
 * Isomorphic and side-effect-free — safe to import in the browser (the canvas
 * editor builds the block client-side before `appendStorySection`). The row
 * shapes mirror `@vismay/footshorts-viz`'s `StandingRow` / `FixtureRow`; we
 * re-declare them here (structurally identical) so this package needn't depend
 * on the vertical bundle.
 *
 * Convention: every team `id` is the entity SLUG (e.g. `psg`), matching the
 * hand-authored configs — so `fs:bracket`'s `highlightTeamId: <slug>` resolves.
 */

export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
export type CompetitionPhase = 'league' | 'group' | 'knockout'

export interface TeamRef {
  id: string
  slug: string
  name: string
  crest_url: string | null
  primary_color?: string | null
}

export interface StandingRowInput {
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
  team: TeamRef | null
  phase?: CompetitionPhase
  group_label?: string
}

export interface FixtureRowInput {
  id: string
  competition_slug: string
  season: string
  matchday: number | null
  stage: string | null
  phase?: CompetitionPhase | null
  kickoff_at: string
  status: FixtureStatus
  home_score: number | null
  away_score: number | null
  home_team_name: string | null
  away_team_name: string | null
  home: TeamRef | null
  away: TeamRef | null
}

/** Subset of `STAGE_LABELS` in `@vismay/footshorts-viz/src/stageLabel.ts`,
 *  inlined to keep this package dependency-free. Unknown codes title-case. */
const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Group Stage',
  LEAGUE_STAGE: 'League Phase',
  PLAY_OFFS: 'Play-offs',
  PLAY_OFF_ROUND: 'Play-off Round',
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
}

function stageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage] ??
    stage
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  )
}

// ── fs:standings-table ──────────────────────────────────────────────────────

export interface StandingsTableBlock {
  type: 'fs:standings-table'
  rows: StandingRowInput[]
}

/** Wrap standings rows as an `fs:standings-table` foreground layer. The DB row
 *  shape is already 1:1 with the module's `StandingRow`, so this is a passthrough
 *  that only stamps the `type`. */
export function buildStandingsTableBlock(rows: StandingRowInput[]): StandingsTableBlock {
  return { type: 'fs:standings-table', rows }
}

// ── fs:match-card ───────────────────────────────────────────────────────────

export type MatchCardLayout = 'compact' | 'horizontal' | 'portrait' | 'score'

export interface MatchCardBlock {
  type: 'fs:match-card'
  layout: MatchCardLayout
  home: string
  away: string
  score?: string
  kickoff?: string
  competition?: string
  competitionSlug?: string
  /** Team brand colors — the editorial card themes its gradient/score from
   *  these. Carried from the entity's `primary_color` when present so the card
   *  isn't rendered un-themed. */
  homeColor?: string
  awayColor?: string
}

export interface MatchCardOptions {
  layout?: MatchCardLayout
  /** Human competition name for the label (e.g. "Champions League"); falls back
   *  to a title-cased slug. */
  competitionName?: string
}

/** Title-case a competition slug as a last-resort display name. */
function competitionDisplayName(slug: string, override?: string): string {
  if (override && override.trim()) return override.trim()
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Build the "Champions League · Quarter-finals" / "· matchday 35" sub-label. */
function matchCompetitionLabel(fixture: FixtureRowInput, competitionName?: string): string {
  const base = competitionDisplayName(fixture.competition_slug, competitionName)
  if (fixture.stage && fixture.stage !== 'REGULAR_SEASON' && fixture.stage !== 'LEAGUE_STAGE') {
    return `${base} · ${stageLabel(fixture.stage)}`
  }
  if (fixture.matchday != null) return `${base} · matchday ${fixture.matchday}`
  return base
}

/** A `Sat · 17:30`-style kickoff label, UTC (no locale dependence so the output
 *  is deterministic across server/client). */
function kickoffLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} · ${hh}:${mm}`
}

const EN_DASH = '–'

/** Team display name: prefer the joined entity name, fall back to the stored
 *  free-text name, then a dash. */
function sideName(ref: TeamRef | null, fallback: string | null): string {
  return ref?.name ?? fallback ?? 'TBD'
}

/**
 * Build an `fs:match-card` from one fixture row. Finished matches render the
 * score (`"2 – 3"`) with a `FT` kickoff tag; not-yet-played matches omit the
 * score and show the kickoff time instead. `home`/`away` are slugs when we have
 * the entity (so the module's palette + DB hydration resolve crests/colors),
 * else the stored team name.
 */
export function buildMatchCardBlock(
  fixture: FixtureRowInput,
  opts: MatchCardOptions = {},
): MatchCardBlock {
  const homeKey = fixture.home?.slug ?? sideName(fixture.home, fixture.home_team_name)
  const awayKey = fixture.away?.slug ?? sideName(fixture.away, fixture.away_team_name)
  const finished =
    fixture.status === 'finished' && fixture.home_score != null && fixture.away_score != null

  const block: MatchCardBlock = {
    type: 'fs:match-card',
    layout: opts.layout ?? 'horizontal',
    home: homeKey,
    away: awayKey,
    competition: matchCompetitionLabel(fixture, opts.competitionName),
    competitionSlug: fixture.competition_slug,
  }
  if (finished) {
    block.score = `${fixture.home_score} ${EN_DASH} ${fixture.away_score}`
    block.kickoff = 'FT'
  } else {
    block.kickoff = kickoffLabel(fixture.kickoff_at)
  }
  if (fixture.home?.primary_color) block.homeColor = fixture.home.primary_color
  if (fixture.away?.primary_color) block.awayColor = fixture.away.primary_color
  return block
}

// ── fs:bracket ──────────────────────────────────────────────────────────────

export interface BracketBlock {
  type: 'fs:bracket'
  layout: 'list' | 'tree' | 'tree-vertical' | 'tree-horizontal'
  fixtures: FixtureRowInput[]
  competitionSlug?: string
  highlightTeamId?: string
  title?: string
}

export interface BracketOptions {
  layout?: BracketBlock['layout']
  highlightTeamId?: string
  title?: string
}

/**
 * Build an `fs:bracket` from a flat fixture list. `buildBracket` (in the viz
 * module) pairs legs by team pair within each knockout stage and ignores
 * non-knockout fixtures, so passing the whole season's fixtures is safe — but
 * the caller should prefer the knockout slice for a clean tree.
 */
export function buildBracketBlock(
  fixtures: FixtureRowInput[],
  opts: BracketOptions = {},
): BracketBlock {
  const block: BracketBlock = {
    type: 'fs:bracket',
    layout: opts.layout ?? 'tree',
    fixtures,
  }
  if (fixtures[0]?.competition_slug) block.competitionSlug = fixtures[0].competition_slug
  if (opts.highlightTeamId) block.highlightTeamId = opts.highlightTeamId
  if (opts.title) block.title = opts.title
  return block
}

// ── fs:match-tile ───────────────────────────────────────────────────────────

export interface MatchTileBlock {
  type: 'fs:match-tile'
  fixture: FixtureRowInput
  competitionCrest?: string
}

/** Wrap one fixture as an `fs:match-tile` — the colorful, team-themed tile. The
 *  module reads the fixture's team `primary_color`s for its gradient, so pass a
 *  fixture whose `home`/`away` refs carry colors for the best result. */
export function buildMatchTileBlock(
  fixture: FixtureRowInput,
  opts: { competitionCrest?: string | null } = {},
): MatchTileBlock {
  const block: MatchTileBlock = { type: 'fs:match-tile', fixture }
  if (opts.competitionCrest) block.competitionCrest = opts.competitionCrest
  return block
}

// ── fs:match-row ────────────────────────────────────────────────────────────

export type MatchRowVariant = 'compact' | 'expanded'

export interface MatchRowBlock {
  type: 'fs:match-row'
  variant: MatchRowVariant
  fixture: FixtureRowInput
}

/** Wrap one fixture as an `fs:match-row` — a single scoreboard row. `compact`
 *  (default) is the dense list row; `expanded` is the chunkier knockout-tie row. */
export function buildMatchRowBlock(
  fixture: FixtureRowInput,
  opts: { variant?: MatchRowVariant } = {},
): MatchRowBlock {
  return { type: 'fs:match-row', variant: opts.variant ?? 'compact', fixture }
}

// ── fs:match-timeline ───────────────────────────────────────────────────────

export type EventTypeFilter = 'all' | 'goal' | 'card' | 'subst'

/** One in-match event, structurally identical to `@vismay/footshorts-viz`'s
 *  `FixtureEvent` and the `fixture_events` row read by `fetchFixtureEvents`. */
export interface FixtureEventInput {
  id: string
  fixture_id: string
  team_id: string | null
  side: 'home' | 'away' | null
  minute: number
  extra_minute: number | null
  type: 'goal' | 'card' | 'subst' | 'var'
  detail: string | null
  player_name: string | null
  assist_name: string | null
}

export interface MatchTimelineBlock {
  type: 'fs:match-timeline'
  events: FixtureEventInput[]
  filter?: EventTypeFilter
  emptyText?: string
}

/** Wrap a fixture's events as an `fs:match-timeline` foreground layer. Events
 *  are embedded inline (like `fs:standings-table`'s rows); `filter` narrows to
 *  one event type at render time. */
export function buildMatchTimelineBlock(
  events: FixtureEventInput[],
  opts: { filter?: EventTypeFilter; emptyText?: string } = {},
): MatchTimelineBlock {
  const block: MatchTimelineBlock = { type: 'fs:match-timeline', events }
  if (opts.filter) block.filter = opts.filter
  if (opts.emptyText) block.emptyText = opts.emptyText
  return block
}

// ── fs:team-form-strip ──────────────────────────────────────────────────────

export type TeamFormLayout = 'strip' | 'grid'

export interface TeamFormStripBlock {
  type: 'fs:team-form-strip'
  fixtures: FixtureRowInput[]
  teamId: string
  label?: string
  layout: TeamFormLayout
  columns?: number
  rows?: number
  cardWidth?: number
}

/** Wrap a team's recent fixtures as an `fs:team-form-strip`. `teamId` is the
 *  entity SLUG whose perspective the W/D/L badges read from; `fixtures` are
 *  oldest → newest. Defaults to a single-row grid of 5 (the "last 5" strip). */
export function buildTeamFormStripBlock(
  fixtures: FixtureRowInput[],
  teamId: string,
  opts: {
    label?: string
    layout?: TeamFormLayout
    columns?: number
    rows?: number
    cardWidth?: number
  } = {},
): TeamFormStripBlock {
  const block: TeamFormStripBlock = {
    type: 'fs:team-form-strip',
    fixtures,
    teamId,
    layout: opts.layout ?? 'grid',
  }
  if (opts.label) block.label = opts.label
  if (opts.columns !== undefined) block.columns = opts.columns
  if (opts.rows !== undefined) block.rows = opts.rows
  if (opts.cardWidth !== undefined) block.cardWidth = opts.cardWidth
  return block
}
