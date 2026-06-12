import { z } from 'zod'
import type { DomainPack, PackLayerType } from './types'

/**
 * The Footshorts desk — football match-weeks, league tables, and form.
 *
 * Generatable vertical layers (zod mirrors of each module's real parseConfig;
 * packs.test.ts round-trips a sample through the real parser):
 *   - fs:match-card      — editorial fixture card; crests/brand colors come
 *                          from the bundled team palette (and server-side
 *                          hydration), so the schema omits every URL/hex field.
 *   - fs:standings-table — league table from a sourced standings list; the
 *                          `team` ref is REQUIRED (the component dereferences
 *                          it), crest_url omitted (monogram fallback).
 *   - fs:team-form-strip — one team's recent results; fixtures carry minimal
 *                          refs (id/slug/name), scores + ISO kickoffs from the
 *                          sources.
 *
 * Skipped footshorts modules, and why:
 *   - fs:standings-over-matchdays — needs a position-by-matchday history per
 *     team; DB-derived snapshots, never present in prose sources.
 *   - fs:bracket — buildBracket needs a complete, internally-consistent
 *     knockout fixture set (stages/legs/ids); fabrication breaks the tree
 *     silently.
 *   - fs:tactics-board — authored per-player x/y keyframes + timed
 *     annotations; an artifact, not derivable from text.
 *   - fs:match-row / fs:match-tile — tractable but redundant list furniture:
 *     match-card covers the fixture beat with richer layouts.
 */

const matchCard: PackLayerType = {
  type: 'fs:match-card',
  label: 'an editorial fixture card — home/away, score or kickoff, competition',
  regions: ['chart', 'default'],
  promptDoc:
    'Use for ONE match beat — a result, a preview, or the story\'s anchor fixture. home/away ' +
    'are team display names ("Arsenal"); score is a free-form display string ("2 – 1", "FT"); ' +
    'kickoff is the pre-match label; competition is the full line ("Premier League · matchday ' +
    '35"). Crests and brand colors come from the bundled palette — never invent URLs or hex.',
  schema: z.object({
    type: z.literal('fs:match-card'),
    layout: z
      .enum(['compact', 'horizontal', 'portrait', 'score'])
      .optional()
      .describe('Card variant. Omit for the default "score" result card.'),
    home: z.string().min(1).describe('Home team display name, e.g. "Arsenal".'),
    away: z.string().min(1).describe('Away team display name, e.g. "Chelsea".'),
    score: z
      .string()
      .optional()
      .describe(
        'Display score/status, e.g. "2 – 1" or "FT" — post-match only. A trailing ' +
          'parenthetical renders as a smaller sub-line: "3 – 3 (4 – 2 pens)".',
      ),
    kickoff: z
      .string()
      .optional()
      .describe('Pre-match kickoff label, e.g. "Sat · 17:30".'),
    competition: z
      .string()
      .optional()
      .describe('Full competition line, e.g. "Premier League · matchday 35".'),
    dateLabel: z
      .string()
      .optional()
      .describe('Date label for the portrait variant, e.g. "Thursday, Jun 5".'),
  }),
}

/** Minimal team ref the components dereference — id/slug/name only; crest_url
 *  is hydration-supplied and deliberately not generated. */
const teamRefSchema = z.object({
  id: z.string().describe('kebab-case team slug, e.g. "arsenal".'),
  slug: z.string().describe('Same kebab-case slug.'),
  name: z.string().describe('Team display name.'),
})

const standingRowSchema = z.object({
  position: z.number().int().describe('League position, 1-based.'),
  team_id: z.string().describe('kebab-case team slug, e.g. "arsenal".'),
  team: teamRefSchema.describe('The team ref — REQUIRED on every row.'),
  competition_slug: z.string().describe('kebab-case competition slug, e.g. "premier-league".'),
  season: z.string().describe('Season label as a string, e.g. "2025".'),
  played: z.number().int(),
  won: z.number().int(),
  draw: z.number().int(),
  lost: z.number().int(),
  goals_for: z.number().int(),
  goals_against: z.number().int(),
  goal_difference: z.number().int(),
  points: z.number().int().describe('League points, from the sources.'),
})

const standingsTable: PackLayerType = {
  type: 'fs:standings-table',
  label: 'a league table (position / team / P W D L / GD / Pts)',
  regions: ['chart', 'default'],
  promptDoc:
    'Use when the sources carry a league table. Emit one row per team in table order, every ' +
    'count from the sources — a focused slice (top 6, relegation zone) beats a full 20-row ' +
    'dump unless the story is the whole table. Crests are supplied by the app; ids are ' +
    'kebab-case slugs of the team names.',
  schema: z.object({
    type: z.literal('fs:standings-table'),
    rows: z
      .array(standingRowSchema)
      .min(1)
      .max(20)
      .describe('Table rows in position order — every figure source-grounded.'),
  }),
}

const fixtureRowSchema = z.object({
  id: z.string().describe('Stable kebab-case fixture id, e.g. "arsenal-chelsea-md35".'),
  competition_slug: z.string().describe('kebab-case competition slug.'),
  season: z.string().describe('Season label as a string, e.g. "2025".'),
  kickoff_at: z.string().describe('Kickoff as an ISO datetime, e.g. "2026-04-21T14:00:00Z".'),
  status: z
    .enum(['scheduled', 'live', 'finished', 'postponed', 'cancelled'])
    .describe('Fixture status — "finished" for played results.'),
  home_score: z.number().int().optional().describe('Omit for unplayed fixtures.'),
  away_score: z.number().int().optional().describe('Omit for unplayed fixtures.'),
  home: teamRefSchema.describe('Home team ref.'),
  away: teamRefSchema.describe('Away team ref.'),
})

const teamFormStrip: PackLayerType = {
  type: 'fs:team-form-strip',
  label: "one team's recent results as W/D/L cards (form strip or grid)",
  regions: ['chart', 'default'],
  promptDoc:
    'Use to establish ONE team\'s recent run when the sources list its results (common in ' +
    'match previews). teamId is the team\'s kebab-case slug; fixtures run oldest → newest ' +
    'with real scores and ISO kickoff datetimes from the sources, 3–6 cards. Crests are ' +
    'supplied by the app.',
  schema: z.object({
    type: z.literal('fs:team-form-strip'),
    teamId: z
      .string()
      .min(1)
      .describe('kebab-case slug of the team whose form this shows — must match a fixture side.'),
    label: z.string().optional().describe('Heading override, e.g. "Form · last 5".'),
    layout: z
      .enum(['strip', 'grid'])
      .optional()
      .describe('Omit for the default scrolling strip.'),
    columns: z.number().int().positive().optional().describe('Grid only — cards per row.'),
    rows: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Grid only — caps visible cards to rows × columns.'),
    fixtures: z
      .array(fixtureRowSchema)
      .min(1)
      .max(8)
      .describe('The recent results, oldest → newest — scores from the sources.'),
  }),
}

export const FOOTSHORTS_PACK: DomainPack = {
  id: 'footshorts',
  name: 'Footshorts',
  persona:
    'You are a football data journalist preparing a data-driven visual story for the ' +
    'Footshorts desk. Your reader lives the match-week rhythm: be precise with scorelines, ' +
    'matchdays, league positions, and competition names, and exact with team and player ' +
    'names. ',
  outlineGuidance:
    'PLAN THE FOOTSHORTS MODULES (deck stories): when the sources carry a fixture or result, ' +
    'that beat\'s "visual" should FEATURE fs:match-card — name the type explicitly; a league ' +
    'table wants fs:standings-table; one team\'s recent run wants fs:team-form-strip. These ' +
    'REPLACE a generic chart/keyValue for fixture, table, and form beats — plan charts only ' +
    'for trends (goals per matchday, points progression), never as table furniture. A typical ' +
    'football story features at least one of these modules when the sources support it.',
  contentGuidance:
    'VOICE: football desk, not a fan blog — form and table context over hot takes, exact ' +
    'scorelines and matchdays from the sources, competitions by their proper names. One ' +
    'precise stat beats three vague ones.',
  visualGuidance:
    'Prefer the Footshorts modules where they fit the beat: a fixture or result wants ' +
    'fs:match-card; a league-table beat wants fs:standings-table; a team\'s recent run ' +
    'wants fs:team-form-strip. Use core layers (bigStat, chart, quote) for everything else.',
  bylineExample: 'By the Footshorts desk',
  extraLayerTypes: [matchCard, standingsTable, teamFormStrip],
}
