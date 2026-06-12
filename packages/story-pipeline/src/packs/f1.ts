import { z } from 'zod'
import type { DomainPack, PackLayerType } from './types'

/**
 * The VizF1 desk — Formula 1 race weekends, championship arithmetic, and the
 * engineering story under the lap times.
 *
 * Generatable vertical layers (zod mirrors of each module's real parseConfig;
 * packs.test.ts round-trips a sample through the real parser):
 *   - f1:race-card        — editorial fixture/result card; the bundled
 *                           grands-prix palette supplies flags/accents, so the
 *                           schema deliberately omits accent/flagUrl/
 *                           backgroundImage/dateLabel.
 *   - f1:driver-standings — championship table from a sourced standings list;
 *                           constructorColor/headshotUrl are hydration-supplied
 *                           and omitted (the component falls back cleanly).
 *
 * Skipped f1 modules, and why:
 *   - f1:position-chart — needs lap-by-lap position series; prose sources never
 *     carry them (telemetry/Ergast ingest required).
 *   - f1:race-replay    — points at real telemetry fixture files
 *     (sessionRef/fixtureUrl); a data asset, not generatable content.
 *   - f1:race-row       — tractable but redundant list furniture: race-card
 *     covers the fixture beat with richer layouts.
 */

const raceCard: PackLayerType = {
  type: 'f1:race-card',
  label: 'an editorial race card — grand prix, round, date, session, winner',
  regions: ['chart', 'default'],
  promptDoc:
    'Use for ONE race weekend beat — a preview, a result, or the story\'s anchor race. ' +
    'grandPrix is the display name ("Monaco Grand Prix"); season is the year; add round, ' +
    'date (YYYY-MM-DD), a free-form sessionLabel, and winner only post-race. Flags, accent ' +
    'colors, and the circuit name come from the bundled palette — never invent URLs or hex.',
  schema: z.object({
    type: z.literal('f1:race-card'),
    layout: z
      .enum(['compact', 'horizontal', 'portrait', 'score'])
      .optional()
      .describe('Card variant. Omit for the default "score" result card.'),
    grandPrix: z
      .string()
      .min(1)
      .describe('Grand Prix display name, e.g. "Monaco Grand Prix".'),
    season: z.number().int().describe('Season year, e.g. 2026.'),
    round: z.number().int().optional().describe('Round number within the season.'),
    date: z.string().optional().describe('Race date as ISO YYYY-MM-DD.'),
    sessionLabel: z
      .string()
      .optional()
      .describe('Free-form session line, e.g. "Race · Sun 14:00" or "Qualifying".'),
    winner: z
      .string()
      .optional()
      .describe('Winning driver display name — only when the race has run.'),
    circuit: z
      .string()
      .optional()
      .describe('Circuit name override when the sources name it; the palette has a default.'),
  }),
}

const driverStandingRowSchema = z.object({
  position: z.number().int().describe('Championship position, 1-based.'),
  driverId: z
    .string()
    .describe('snake_case slug of the driver name, e.g. "max_verstappen".'),
  driverName: z.string().describe('Driver display name, e.g. "Max Verstappen".'),
  constructorId: z.string().describe('snake_case slug of the team, e.g. "red_bull".'),
  constructorName: z.string().describe('Team display name, e.g. "Red Bull".'),
  points: z.number().describe('Championship points, from the sources.'),
  wins: z.number().int().describe('Season wins, from the sources.'),
})

const driverStandings: PackLayerType = {
  type: 'f1:driver-standings',
  label: 'the drivers\' championship table (position / driver / team / wins / pts)',
  regions: ['chart', 'default'],
  promptDoc:
    'Use when the sources carry a drivers\' championship table. Emit one row per driver ' +
    'in standings order, every points/wins figure from the sources — cap at the top 10 ' +
    'unless the story needs the full grid. Team colors and headshots are hydrated by the ' +
    'app; ids are snake_case slugs of the names.',
  schema: z.object({
    type: z.literal('f1:driver-standings'),
    rows: z
      .array(driverStandingRowSchema)
      .min(1)
      .max(10)
      .describe('Standings rows in position order — every figure source-grounded.'),
  }),
}

export const F1_PACK: DomainPack = {
  id: 'f1',
  name: 'VizF1',
  persona:
    'You are a motorsport data journalist preparing a data-driven visual story for the ' +
    'VizF1 desk. Your reader follows Formula 1 race by race: be precise with the units ' +
    'that matter — laps, sectors, tenths, grid slots, championship points — and exact ' +
    'with driver, team, and circuit names. ',
  outlineGuidance:
    'PLAN THE VIZF1 MODULES (deck stories): when the sources carry a race result or fixture, ' +
    'that beat\'s "visual" should FEATURE f1:race-card — name the type explicitly; when they ' +
    'carry a drivers\' championship table, plan f1:driver-standings. These REPLACE a generic ' +
    'chart/keyValue for fixture and standings beats — plan charts only for trends (points ' +
    'progression, lap-time evolution), never as table furniture. A typical F1 story features ' +
    'at least one of these modules when the sources support it.',
  contentGuidance:
    'VOICE: motorsport desk, not a press release — championship stakes over hype, the ' +
    'engineering reason under every gap, exact figures (laps, tenths, points) from the ' +
    'sources. Name drivers and teams precisely; never round a lap time.',
  visualGuidance:
    'Prefer the VizF1 modules where they fit the beat: a race weekend (preview or result) ' +
    'wants f1:race-card; a championship-table beat wants f1:driver-standings. Use core ' +
    'layers (bigStat, chart, quote) for everything else.',
  bylineExample: 'By the VizF1 desk',
  extraLayerTypes: [raceCard, driverStandings],
}
