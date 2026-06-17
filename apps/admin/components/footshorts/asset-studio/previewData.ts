import type {
  FixtureRow,
  FixtureTeamRef,
  StandingRow,
  Bracket,
  TeamLane,
} from '@vismay/footshorts-viz/types'
import { buildBracket } from '@vismay/footshorts-viz/web'
import type { MatchCardConfig } from '@vismay/footshorts-viz/web'

/**
 * Sample data for the asset studio, parameterised by the picked entity and its
 * working color. A team and a competition use the color in fundamentally
 * different ways, so they produce different preview shapes:
 *
 *  - a TEAM is a participant — the color is its identity (badge, tile gradient,
 *    card wash, standings lane, form).
 *  - a LEAGUE is the frame — the color never appears as a home/away side; it
 *    tints the league tile, the bracket emblem, match-card competition accents
 *    and feed placeholders.
 *
 * Everything is fictional except the picked entity so the brand color reads
 * clearly against neutral opponents — no DB fixtures required.
 */

export interface PreviewEntity {
  kind: 'team' | 'league'
  slug: string
  name: string
  country: string | null
  crestUrl: string | null
}

/** Neutral opponents — muted, desaturated so the picked color dominates. */
const OPP_A = { id: 'asset-opp-a', name: 'Northgate', color: '#3A3D4A' }
const OPP_B = { id: 'asset-opp-b', name: 'Rivermouth', color: '#4A4035' }
const OPP_C = { id: 'asset-opp-c', name: 'Castleford', color: '#2F3A3A' }

const SEASON = '2025'
const COMP_SLUG = 'asset-preview' // intentionally NOT a bundled slug → accent falls through to the theme/picked var

/** A fixture team ref. `slug` is null so preview rows/cards never link to a
 *  (non-existent) `/team/:slug` route in admin. */
function teamRef(
  id: string,
  name: string,
  opts: { crestUrl?: string | null; color?: string | null } = {},
): FixtureTeamRef {
  return {
    id,
    slug: null as unknown as string, // typed as string in the lib; null disables the row link
    name,
    crest_url: opts.crestUrl ?? null,
    primary_color: opts.color ?? null,
  }
}

function fixture(opts: {
  id: string
  home: FixtureTeamRef
  away: FixtureTeamRef
  homeScore?: number
  awayScore?: number
  stage?: string
  kickoff?: string
}): FixtureRow {
  const finished = opts.homeScore != null && opts.awayScore != null
  return {
    id: opts.id,
    competition_slug: COMP_SLUG,
    season: SEASON,
    matchday: null,
    stage: opts.stage ?? null,
    phase: opts.stage ? 'knockout' : 'league',
    kickoff_at: opts.kickoff ?? '2026-05-10T15:00:00Z',
    status: finished ? 'finished' : 'scheduled',
    home_score: opts.homeScore ?? null,
    away_score: opts.awayScore ?? null,
    home_team_name: opts.home?.name ?? null,
    away_team_name: opts.away?.name ?? null,
    home: opts.home,
    away: opts.away,
  }
}

/** Two-leg knockout bracket between neutral sides (the competition's bracket). */
function neutralBracket(): Bracket | null {
  return buildBracket([
    fixture({
      id: 'sf',
      home: teamRef(OPP_A.id, OPP_A.name, { color: OPP_A.color }),
      away: teamRef(OPP_C.id, OPP_C.name, { color: OPP_C.color }),
      homeScore: 2,
      awayScore: 1,
      stage: 'SEMI_FINALS',
      kickoff: '2026-05-01T19:00:00Z',
    }),
    fixture({
      id: 'final',
      home: teamRef(OPP_A.id, OPP_A.name, { color: OPP_A.color }),
      away: teamRef(OPP_B.id, OPP_B.name, { color: OPP_B.color }),
      homeScore: 3,
      awayScore: 1,
      stage: 'FINAL',
      kickoff: '2026-05-31T19:00:00Z',
    }),
  ])
}

// ── team preview ──────────────────────────────────────────────────────────────

export interface TeamPreviewData {
  kind: 'team'
  matchCardScore: MatchCardConfig
  matchCardHorizontal: MatchCardConfig
  tileFixture: FixtureRow
  rowFixture: FixtureRow
  formFixtures: FixtureRow[]
  standingsRows: StandingRow[]
  chart: { competitionLabel: string; lanes: TeamLane[] }
  bracket: Bracket | null
  /** Pure-color brand badge (Crest monogram), independent of any crest image. */
  badge: { team: string; color: string }
  /** The subject team's ref id — the `teamId` the form strip is keyed to. */
  teamId: string
}

function buildTeam(entity: PreviewEntity, color: string): TeamPreviewData {
  const subjectId = entity.slug || 'asset-subject'
  const home = teamRef(subjectId, entity.name, { crestUrl: entity.crestUrl, color })
  const awayA = teamRef(OPP_A.id, OPP_A.name, { color: OPP_A.color })
  const awayB = teamRef(OPP_B.id, OPP_B.name, { color: OPP_B.color })
  const awayC = teamRef(OPP_C.id, OPP_C.name, { color: OPP_C.color })

  const matchCardCommon: Omit<MatchCardConfig, 'type' | 'layout'> = {
    home: entity.name,
    away: OPP_A.name,
    score: '2 – 1',
    kickoff: 'FT',
    competition: 'League · Matchday 32',
    competitionSlug: COMP_SLUG,
    homeColor: color,
    awayColor: OPP_A.color,
    homeCrestUrl: entity.crestUrl ?? undefined,
  }

  return {
    kind: 'team',
    matchCardScore: { type: 'fs:match-card', layout: 'score', ...matchCardCommon },
    matchCardHorizontal: { type: 'fs:match-card', layout: 'horizontal', ...matchCardCommon },
    tileFixture: fixture({ id: 'asset-tile', home, away: awayA, homeScore: 2, awayScore: 1 }),
    rowFixture: fixture({ id: 'asset-row', home, away: awayB, homeScore: 3, awayScore: 0 }),
    formFixtures: [
      fixture({ id: 'f1', home, away: awayA, homeScore: 2, awayScore: 1 }),
      fixture({ id: 'f2', home: awayB, away: home, homeScore: 0, awayScore: 0 }),
      fixture({ id: 'f3', home, away: awayC, homeScore: 1, awayScore: 2 }),
      fixture({ id: 'f4', home: awayA, away: home, homeScore: 1, awayScore: 3 }),
      fixture({ id: 'f5', home, away: awayB, homeScore: 4, awayScore: 0 }),
    ],
    standingsRows: standingsRows(entity.name, entity.crestUrl),
    chart: {
      competitionLabel: 'League · 2025/26',
      lanes: [
        {
          team_id: subjectId,
          team_name: entity.name,
          team_code: entity.name.slice(0, 3).toUpperCase(),
          color,
          highlight: true,
          lineWidth: 3.5,
          points: [
            { matchday: 30, position: 5 },
            { matchday: 31, position: 4 },
            { matchday: 32, position: 4 },
            { matchday: 33, position: 3 },
            { matchday: 34, position: 2 },
            { matchday: 35, position: 2 },
            { matchday: 36, position: 1 },
          ],
        },
        { team_id: OPP_A.id, team_name: OPP_A.name, color: OPP_A.color, points: ladder([1, 1, 2, 2, 1, 1, 2]) },
        { team_id: OPP_B.id, team_name: OPP_B.name, color: OPP_B.color, points: ladder([3, 3, 3, 4, 4, 3, 3]) },
      ],
    },
    bracket: buildBracket([
      fixture({
        id: 'sf',
        home,
        away: awayA,
        homeScore: 2,
        awayScore: 1,
        stage: 'SEMI_FINALS',
        kickoff: '2026-05-01T19:00:00Z',
      }),
      fixture({
        id: 'final',
        home,
        away: awayB,
        homeScore: 3,
        awayScore: 1,
        stage: 'FINAL',
        kickoff: '2026-05-31T19:00:00Z',
      }),
    ]),
    badge: { team: entity.name, color },
    teamId: subjectId,
  }
}

// ── league preview ────────────────────────────────────────────────────────────

export interface LeaguePreviewData {
  kind: 'league'
  name: string
  country: string | null
  crestUrl: string | null
  color: string
  /** Editorial card framed by the competition accent (teams keep own colors). */
  matchCard: MatchCardConfig
  /** Knockout bracket whose emblem badge takes the competition color. */
  bracket: Bracket | null
  /** Sample headline for the feed-placeholder gradient. */
  feedHeadline: string
}

function buildLeague(entity: PreviewEntity, color: string): LeaguePreviewData {
  return {
    kind: 'league',
    name: entity.name,
    country: entity.country,
    crestUrl: entity.crestUrl,
    color,
    matchCard: {
      type: 'fs:match-card',
      layout: 'score',
      home: OPP_A.name,
      away: OPP_B.name,
      score: '2 – 1',
      kickoff: 'FT',
      competition: entity.name,
      competitionSlug: COMP_SLUG,
      // Competition color drives the accent (competition name + score text);
      // the two sides keep their own (neutral) colors.
      accent: color,
      homeColor: OPP_A.color,
      awayColor: OPP_B.color,
    },
    bracket: neutralBracket(),
    feedHeadline: `${entity.name}: the title race goes to the final day`,
  }
}

export type PreviewData = TeamPreviewData | LeaguePreviewData

export function buildPreviewData(entity: PreviewEntity, color: string): PreviewData {
  return entity.kind === 'league' ? buildLeague(entity, color) : buildTeam(entity, color)
}

// ── helpers ───────────────────────────────────────────────────────────────────

function ladder(positions: number[]): TeamLane['points'] {
  return positions.map((position, i) => ({ matchday: 30 + i, position }))
}

function standingsRows(name: string, crestUrl: string | null): StandingRow[] {
  const rows: Array<[number, string, string | null, number, number]> = [
    [1, name, crestUrl, 89, 28],
    [2, OPP_A.name, null, 84, 26],
    [3, OPP_B.name, null, 77, 23],
    [4, OPP_C.name, null, 71, 21],
    [5, 'Eastvale', null, 64, 19],
  ]
  return rows.map(([position, team, crest, points, won]) => ({
    competition_slug: COMP_SLUG,
    season: SEASON,
    team_id: `std-${position}`,
    position,
    played: 38,
    won,
    draw: Math.max(0, points - won * 3),
    lost: 38 - won - Math.max(0, points - won * 3),
    goals_for: 70 + (6 - position) * 5,
    goals_against: 25 + position * 3,
    goal_difference: 70 + (6 - position) * 5 - (25 + position * 3),
    points,
    form: null,
    team: { id: `std-${position}`, slug: null as unknown as string, name: team, crest_url: crest },
  }))
}
