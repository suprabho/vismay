import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'
import {
  type FsBackgroundConfig,
  fsBackgroundFields,
  parseFsBackground,
} from '../shared/background'
import { parsePositiveInt, parsePositiveNumber } from '../shared/grid'

/**
 * `fs:match-tile` — Foreground viz module wrapping the MatchTile component.
 *
 * A compact, team-themed fixture tile (gradient background driven by team
 * primary colors, watermark crest, top-left score/time/LIVE pill). Good for
 * horizontal strips and grid callouts.
 *
 * Two layouts:
 *   - `single` (default) — one `fixture`, centered.
 *   - `grid` — a `columns`-wide matrix of `fixtures`, capped to `rows × columns`
 *     when `rows` is set. `cardWidth` forces a uniform fixed tile width (px);
 *     omit it and grid tiles stretch to share the row equally.
 *
 * Every layout also accepts the shared image-background fields
 * (`backgroundImage` / `backgroundFit` / `backgroundDim` / `backgroundBlur`),
 * painted behind the tile(s) — see `../shared/background`.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:match-tile
 *       layout: grid              # optional: single (default) | grid
 *       columns: 2                # grid only — tiles per row (default 2)
 *       rows: 3                   # grid only — caps tiles to rows × columns
 *       cardWidth: 240            # optional — uniform tile width in px
 *       backgroundImage: "https://…"  # optional image behind the tile(s)
 *       fixtures:                 # grid layout
 *         - id: m1
 *           competition_slug: prem
 *           season: '2025'
 *           kickoff_at: '2026-04-21T14:00:00Z'
 *           status: finished
 *           home_score: 2
 *           away_score: 1
 *           home: { id: arsenal, slug: arsenal, name: Arsenal, crest_url: null, primary_color: '#EF0107' }
 *           away: { id: chelsea, slug: chelsea, name: Chelsea, crest_url: null, primary_color: '#034694' }
 *       # single layout uses `fixture:` (one object) instead of `fixtures:`
 */

export type MatchTileLayout = 'single' | 'grid'

const LAYOUTS: readonly MatchTileLayout[] = ['single', 'grid']

export interface MatchTileConfig extends FsBackgroundConfig {
  type: 'fs:match-tile'
  layout: MatchTileLayout
  /** Single layout — the one fixture to render. */
  fixture?: FixtureRow
  /** Grid layout — fixtures tiled into a matrix (author order). */
  fixtures?: FixtureRow[]
  /** Grid only — tiles per row. Defaults to 2. */
  columns?: number
  /** Grid only — caps visible tiles to `rows × columns` (first ones kept). */
  rows?: number
  /** Uniform fixed tile width in px (both layouts). */
  cardWidth?: number
  /** Crest washed into the bottom-right corner of every tile. */
  competitionCrest?: string | null
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseLayout(raw: unknown, label: string): MatchTileLayout {
  if (raw === undefined || raw === null) return 'single'
  if (typeof raw !== 'string' || !LAYOUTS.includes(raw as MatchTileLayout)) {
    throw new Error(
      `${label}: fs:match-tile 'layout' must be one of ${LAYOUTS.join(', ')} (got ${String(raw)})`,
    )
  }
  return raw as MatchTileLayout
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchTileConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: fs:match-tile layer must be an object`)
  const layout = parseLayout(raw.layout, ctx.label)
  const crest = raw.competitionCrest
  const columns = parsePositiveInt(raw.columns, 'columns', ctx.label)
  const rows = parsePositiveInt(raw.rows, 'rows', ctx.label)
  const cardWidth = parsePositiveNumber(raw.cardWidth, 'cardWidth', ctx.label)
  const base = {
    type: 'fs:match-tile' as const,
    layout,
    competitionCrest: typeof crest === 'string' && crest.length > 0 ? crest : null,
    ...(columns !== undefined ? { columns } : {}),
    ...(rows !== undefined ? { rows } : {}),
    ...(cardWidth !== undefined ? { cardWidth } : {}),
    ...parseFsBackground(raw),
  }

  if (layout === 'grid') {
    if (!Array.isArray(raw.fixtures) || raw.fixtures.length === 0) {
      throw new Error(`${ctx.label}: fs:match-tile grid layout requires a non-empty 'fixtures' array`)
    }
    if (!raw.fixtures.every((f) => isObj(f) && typeof f.id === 'string')) {
      throw new Error(`${ctx.label}: every fs:match-tile fixture needs a string 'id'`)
    }
    return { ...base, fixtures: raw.fixtures as unknown as FixtureRow[] }
  }

  if (!isObj(raw.fixture)) {
    throw new Error(`${ctx.label}: fs:match-tile requires a 'fixture' object`)
  }
  if (typeof raw.fixture.id !== 'string') {
    throw new Error(`${ctx.label}: fs:match-tile.fixture requires a string 'id'`)
  }
  return { ...base, fixture: raw.fixture as unknown as FixtureRow }
}

function adminForm(): AdminFormField[] {
  return [
    {
      kind: 'select',
      key: 'layout',
      label: 'Layout',
      options: LAYOUTS.map((l) => ({ value: l, label: l })),
    },
    { kind: 'json', key: 'fixture', label: 'Fixture (single layout)' },
    { kind: 'json', key: 'fixtures', label: 'Fixtures (grid layout)' },
    { kind: 'number', key: 'columns', label: 'Columns (grid only)', min: 1, step: 1 },
    { kind: 'number', key: 'rows', label: 'Rows (grid only — caps to rows × columns)', min: 1, step: 1 },
    { kind: 'number', key: 'cardWidth', label: 'Tile width in px (uniform; blank = auto)', min: 1, step: 1 },
    { kind: 'text', key: 'competitionCrest', label: 'Competition crest URL' },
    ...fsBackgroundFields(),
  ]
}

const matchTileModule: VizModule<MatchTileConfig> = {
  type: 'fs:match-tile',
  label: 'Footshorts — match tile',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const ids =
      config.layout === 'grid'
        ? (config.fixtures ?? []).map((f) => f.id).join('|')
        : (config.fixture?.id ?? '')
    return `fs:match-tile:${config.layout}:${config.columns ?? ''}x${config.rows ?? ''}:${config.cardWidth ?? ''}:${ids}:${config.backgroundImage ?? ''}`
  },
}

export default matchTileModule
