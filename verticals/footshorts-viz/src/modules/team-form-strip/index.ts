import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'
import type { TeamFormLayout } from '../../web/TeamFormStrip'
import {
  type FsBackgroundConfig,
  fsBackgroundFields,
  parseFsBackground,
} from '../shared/background'

/**
 * `fs:team-form-strip` — Foreground viz module wrapping TeamFormStrip.
 *
 * Recent-result cards for one team — each card shows the opponent crest, score,
 * fixture side (vs/@) and a W/D/L badge, all from `teamId`'s perspective. Good
 * for establishing a side's recent run.
 *
 * Two layouts share the same card:
 *   - `strip` (default) — one horizontally-scrolling row.
 *   - `grid` — a `columns`-wide matrix, capped to `rows × columns` when `rows`
 *     is set (keeps the most recent fixtures).
 *
 * `cardWidth` forces a uniform fixed card width (px) in either layout; omit it
 * and grid cards stretch to share the row equally while strip cards size to
 * their content.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:team-form-strip
 *       teamId: middlesbrough
 *       label: "Form · last 5"   # optional, defaults to "Form · last 5"
 *       layout: grid             # optional: strip (default) | grid
 *       columns: 5               # grid only — cards per row (default 5)
 *       rows: 3                  # grid only — caps cards to rows × columns
 *       cardWidth: 96            # optional — uniform card width in px
 *       fixtures:                # oldest → newest
 *         - id: f1
 *           competition_slug: champ
 *           season: '2025'
 *           kickoff_at: '2026-04-21T14:00:00Z'
 *           status: finished
 *           home_score: 2
 *           away_score: 1
 *           home: { id: middlesbrough, slug: middlesbrough, name: Middlesbrough, crest_url: null }
 *           away: { id: leeds, slug: leeds, name: Leeds, crest_url: null }
 */

const LAYOUTS: readonly TeamFormLayout[] = ['strip', 'grid']

export interface TeamFormStripConfig extends FsBackgroundConfig {
  type: 'fs:team-form-strip'
  fixtures: FixtureRow[]
  teamId: string
  label?: string
  layout: TeamFormLayout
  /** Grid only — cards per row. */
  columns?: number
  /** Grid only — caps visible cards to `rows × columns` (most recent). */
  rows?: number
  /** Uniform fixed card width in px (both layouts). */
  cardWidth?: number
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseLayout(raw: unknown, label: string): TeamFormLayout {
  if (raw === undefined || raw === null) return 'strip'
  if (typeof raw !== 'string' || !LAYOUTS.includes(raw as TeamFormLayout)) {
    throw new Error(
      `${label}: fs:team-form-strip 'layout' must be one of ${LAYOUTS.join(', ')} (got ${String(raw)})`,
    )
  }
  return raw as TeamFormLayout
}

function parsePositiveInt(raw: unknown, field: string, label: string): number | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
    throw new Error(`${label}: fs:team-form-strip '${field}' must be a positive integer`)
  }
  return raw
}

function parsePositiveNumber(raw: unknown, field: string, label: string): number | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(`${label}: fs:team-form-strip '${field}' must be a positive number (pixels)`)
  }
  return raw
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TeamFormStripConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: fs:team-form-strip layer must be an object`)
  if (typeof raw.teamId !== 'string' || raw.teamId.length === 0) {
    throw new Error(`${ctx.label}: fs:team-form-strip requires a string 'teamId'`)
  }
  if (!Array.isArray(raw.fixtures)) {
    throw new Error(`${ctx.label}: fs:team-form-strip requires a 'fixtures' array`)
  }
  if (raw.fixtures.length === 0) {
    throw new Error(`${ctx.label}: fs:team-form-strip 'fixtures' must not be empty`)
  }
  if (!raw.fixtures.every((f) => isObj(f) && typeof f.id === 'string')) {
    throw new Error(`${ctx.label}: every fs:team-form-strip fixture needs a string 'id'`)
  }
  const label = typeof raw.label === 'string' && raw.label.length > 0 ? raw.label : undefined
  const columns = parsePositiveInt(raw.columns, 'columns', ctx.label)
  const rows = parsePositiveInt(raw.rows, 'rows', ctx.label)
  const cardWidth = parsePositiveNumber(raw.cardWidth, 'cardWidth', ctx.label)
  return {
    type: 'fs:team-form-strip',
    fixtures: raw.fixtures as unknown as FixtureRow[],
    teamId: raw.teamId,
    layout: parseLayout(raw.layout, ctx.label),
    ...(label ? { label } : {}),
    ...(columns !== undefined ? { columns } : {}),
    ...(rows !== undefined ? { rows } : {}),
    ...(cardWidth !== undefined ? { cardWidth } : {}),
    ...parseFsBackground(raw),
  }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'text', key: 'teamId', label: 'Team id (perspective)', required: true },
    { kind: 'text', key: 'label', label: 'Heading (e.g. "Form · last 5")' },
    {
      kind: 'select',
      key: 'layout',
      label: 'Layout',
      options: LAYOUTS.map((l) => ({ value: l, label: l })),
    },
    { kind: 'number', key: 'columns', label: 'Columns (grid only)', min: 1, step: 1 },
    { kind: 'number', key: 'rows', label: 'Rows (grid only — caps to rows × columns)', min: 1, step: 1 },
    { kind: 'number', key: 'cardWidth', label: 'Card width in px (uniform; blank = auto)', min: 1, step: 1 },
    { kind: 'json', key: 'fixtures', label: 'Fixtures (oldest → newest)' },
    ...fsBackgroundFields(),
  ]
}

const teamFormStripModule: VizModule<TeamFormStripConfig> = {
  type: 'fs:team-form-strip',
  label: 'Footshorts — team form strip',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) =>
    `fs:team-form-strip:${config.layout}:${config.columns ?? ''}x${config.rows ?? ''}:${config.cardWidth ?? ''}:${config.teamId}:${config.fixtures.map((f) => f.id).join('|')}:${config.backgroundImage ?? ''}`,
}

export default teamFormStripModule
