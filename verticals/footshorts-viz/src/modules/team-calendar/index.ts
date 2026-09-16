import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'
import { isCalendarMonth, type WeekStart } from '../../teamCalendar'
import { DEFAULT_WATERMARK_ALPHA } from '../../web/TeamCalendar'
import {
  type FsBackgroundConfig,
  fsBackgroundFields,
  parseFsBackground,
} from '../shared/background'

/**
 * `fs:team-calendar` — Foreground viz module wrapping TeamCalendar.
 *
 * One team's month as a wall calendar. Every match day tells you the
 * competition (cell tinted in its color, logo or short code watermarked behind),
 * whether it's home or away (house / plane icon; home days ringed in the team
 * color) and the opponent (large crest); finished matches add the score as a
 * W/D/L pill. Every cell is the same fixed height. Good for "the month ahead"
 * and "a brutal October" beats.
 *
 * `fixtures` can be the team's whole season — the component keeps only the
 * fixtures inside `month` that involve `teamId` (entity id or slug).
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:team-calendar
 *       teamId: arsenal
 *       month: '2026-10'            # YYYY-MM
 *       label: "Arsenal · October"  # optional, defaults to "October 2026"
 *       weekStart: mon              # optional: mon (default) | sun
 *       showScores: true            # optional — finished scores on match days
 *       showLegend: true            # optional — home/away + competition key
 *       teamColor: '#EF0107'        # optional — home-day ring (defaults to the team's brand color)
 *       competitionLogos:           # optional — slug → logo URL, watermarked on that competition's days
 *         premier-league: https://…/premier-league.png
 *       competitionColors:          # optional — slug → #RRGGBB, overrides the bundled competition palette
 *         premier-league: '#3D195B'
 *       watermarkAlpha: 0.22        # optional — watermark opacity 0–1 (0 hides it)
 *       fixtures:
 *         - id: f1
 *           competition_slug: premier-league
 *           season: '26-27'
 *           kickoff_at: '2026-10-03T14:00:00Z'
 *           status: scheduled
 *           home: { id: arsenal, slug: arsenal, name: Arsenal, crest_url: null }
 *           away: { id: chelsea, slug: chelsea, name: Chelsea, crest_url: null }
 */

const WEEK_STARTS: readonly WeekStart[] = ['mon', 'sun']

export interface TeamCalendarConfig extends FsBackgroundConfig {
  type: 'fs:team-calendar'
  fixtures: FixtureRow[]
  teamId: string
  /** `YYYY-MM`. */
  month: string
  label?: string
  weekStart: WeekStart
  showScores: boolean
  showLegend: boolean
  /** `#RRGGBB` home-day ring color override. */
  teamColor?: string
  /** Competition slug → logo URL, watermarked behind that competition's match days. */
  competitionLogos?: Record<string, string>
  /** Competition slug → `#RRGGBB`, overriding the bundled palette for that competition. */
  competitionColors?: Record<string, string>
  /** Watermark opacity, 0–1. */
  watermarkAlpha: number
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseWeekStart(raw: unknown, label: string): WeekStart {
  if (raw === undefined || raw === null) return 'mon'
  if (typeof raw !== 'string' || !WEEK_STARTS.includes(raw as WeekStart)) {
    throw new Error(
      `${label}: fs:team-calendar 'weekStart' must be one of ${WEEK_STARTS.join(', ')} (got ${String(raw)})`,
    )
  }
  return raw as WeekStart
}

function parseBool(raw: unknown, field: string, fallback: boolean, label: string): boolean {
  if (raw === undefined || raw === null) return fallback
  if (typeof raw !== 'boolean') {
    throw new Error(`${label}: fs:team-calendar '${field}' must be a boolean`)
  }
  return raw
}

function parseAlpha(raw: unknown, label: string): number {
  if (raw === undefined || raw === null) return DEFAULT_WATERMARK_ALPHA
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    throw new Error(`${label}: fs:team-calendar 'watermarkAlpha' must be a number from 0 to 1`)
  }
  return raw
}

/** `{ slug: value }` — keeps only the pairs whose value is a string passing
 *  `accept`; undefined when nothing survives. */
function parseSlugMap(
  raw: unknown,
  field: string,
  accept: (v: string) => boolean,
  label: string,
): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isObj(raw)) throw new Error(`${label}: fs:team-calendar '${field}' must be a map keyed by competition slug`)
  const out: Record<string, string> = {}
  for (const [slug, v] of Object.entries(raw)) {
    if (typeof v === 'string' && slug.length > 0 && accept(v)) out[slug] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const HEX6 = /^#[0-9a-fA-F]{6}$/

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TeamCalendarConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: fs:team-calendar layer must be an object`)
  if (typeof raw.teamId !== 'string' || raw.teamId.length === 0) {
    throw new Error(`${ctx.label}: fs:team-calendar requires a string 'teamId'`)
  }
  if (!isCalendarMonth(raw.month)) {
    throw new Error(`${ctx.label}: fs:team-calendar requires 'month' as YYYY-MM (got ${String(raw.month)})`)
  }
  if (!Array.isArray(raw.fixtures)) {
    throw new Error(`${ctx.label}: fs:team-calendar requires a 'fixtures' array`)
  }
  if (!raw.fixtures.every((f) => isObj(f) && typeof f.id === 'string')) {
    throw new Error(`${ctx.label}: every fs:team-calendar fixture needs a string 'id'`)
  }
  const label = typeof raw.label === 'string' && raw.label.length > 0 ? raw.label : undefined
  const teamColor =
    typeof raw.teamColor === 'string' && HEX6.test(raw.teamColor)
      ? raw.teamColor
      : undefined
  const competitionLogos = parseSlugMap(raw.competitionLogos, 'competitionLogos', (v) => v.length > 0, ctx.label)
  const competitionColors = parseSlugMap(raw.competitionColors, 'competitionColors', (v) => HEX6.test(v), ctx.label)
  return {
    type: 'fs:team-calendar',
    fixtures: raw.fixtures as unknown as FixtureRow[],
    teamId: raw.teamId,
    month: raw.month,
    weekStart: parseWeekStart(raw.weekStart, ctx.label),
    showScores: parseBool(raw.showScores, 'showScores', true, ctx.label),
    showLegend: parseBool(raw.showLegend, 'showLegend', true, ctx.label),
    watermarkAlpha: parseAlpha(raw.watermarkAlpha, ctx.label),
    ...(label ? { label } : {}),
    ...(teamColor ? { teamColor } : {}),
    ...(competitionLogos ? { competitionLogos } : {}),
    ...(competitionColors ? { competitionColors } : {}),
    ...parseFsBackground(raw),
  }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'text', key: 'teamId', label: 'Team id (perspective)', required: true },
    { kind: 'text', key: 'month', label: 'Month (YYYY-MM)', placeholder: '2026-10', required: true },
    { kind: 'text', key: 'label', label: 'Heading (defaults to the month name)' },
    {
      kind: 'select',
      key: 'weekStart',
      label: 'Week starts on',
      options: WEEK_STARTS.map((w) => ({ value: w, label: w === 'mon' ? 'Monday' : 'Sunday' })),
    },
    { kind: 'boolean', key: 'showScores', label: 'Show finished scores' },
    { kind: 'boolean', key: 'showLegend', label: 'Show legend' },
    { kind: 'text', key: 'teamColor', label: 'Home-day ring (#RRGGBB; blank = team brand color)' },
    { kind: 'json', key: 'competitionLogos', label: 'Competition logos (slug → URL, watermarked on match days)' },
    { kind: 'json', key: 'competitionColors', label: 'Competition colors (slug → #RRGGBB; blank = bundled palette)' },
    {
      kind: 'number',
      key: 'watermarkAlpha',
      label: 'Competition watermark opacity (0–1)',
      min: 0,
      max: 1,
      step: 0.02,
    },
    { kind: 'json', key: 'fixtures', label: 'Fixtures (any order; other months are ignored)' },
    ...fsBackgroundFields(),
  ]
}

const teamCalendarModule: VizModule<TeamCalendarConfig> = {
  type: 'fs:team-calendar',
  label: 'Footshorts — team calendar (month)',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) =>
    `fs:team-calendar:${config.teamId}:${config.month}:${config.weekStart}:${config.showScores ? 1 : 0}${config.showLegend ? 1 : 0}:${config.watermarkAlpha}:${config.teamColor ?? ''}:${Object.entries(config.competitionLogos ?? {}).map(([k, v]) => `${k}=${v}`).join(',')}:${Object.entries(config.competitionColors ?? {}).map(([k, v]) => `${k}=${v}`).join(',')}:${config.fixtures.map((f) => f.id).join('|')}:${config.backgroundImage ?? ''}`,
}

export default teamCalendarModule
