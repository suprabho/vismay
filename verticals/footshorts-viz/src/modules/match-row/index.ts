import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'
import {
  type FsBackgroundConfig,
  fsBackgroundFields,
  parseFsBackground,
} from '../shared/background'

/**
 * `fs:match-row` — Foreground viz module wrapping the MatchRow component.
 *
 * Renders a football fixture (team crests + score + kickoff status) either as a
 * single row (`fixture`) or as a single-column stack of rows (`fixtures`) — the
 * MatchRow component already draws separators between stacked rows. YAML carries
 * the full FixtureRow shape inline; future iterations can swap to a data:
 * reference that pulls live from the fixtures table.
 *
 * The `variant` field mirrors the MatchRow component's `compact`/`expanded`
 * styling — `expanded` is the format used inside knockout-tie cards (larger
 * crests, stacked team names, big score). Defaults to `compact`.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:match-row
 *       variant: expanded      # optional; 'compact' (default) or 'expanded'
 *       fixture:
 *         id: m1
 *         competition_slug: prem
 *         season: '2025'
 *         kickoff_at: '2026-04-21T14:00:00Z'
 *         status: finished
 *         home_score: 2
 *         away_score: 1
 *         home: { id: arsenal, slug: arsenal, name: Arsenal, crest_url: null }
 *         away: { id: chelsea, slug: chelsea, name: Chelsea, crest_url: null }
 *
 *   # stack variant — several fixtures in one column:
 *     - type: fs:match-row
 *       fixtures:
 *         - { id: m1, kickoff_at: '…', status: finished, home_score: 2, away_score: 1, home: {…}, away: {…} }
 *         - { id: m2, kickoff_at: '…', status: scheduled, home: {…}, away: {…} }
 */

export type MatchRowVariant = 'compact' | 'expanded'

const VARIANTS: readonly MatchRowVariant[] = ['compact', 'expanded']

export interface MatchRowConfig extends FsBackgroundConfig {
  type: 'fs:match-row'
  variant: MatchRowVariant
  /** A single fixture (default). Set exactly one of `fixture` / `fixtures`. */
  fixture?: FixtureRow
  /** A single-column stack of fixtures. Takes precedence over `fixture` when set. */
  fixtures?: FixtureRow[]
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

/** Validates one inline fixture, shallow-trusting the shape past the required `id`. */
function parseFixture(raw: unknown, label: string, where: string): FixtureRow {
  if (!isObj(raw)) throw new Error(`${label}: fs:match-row ${where} must be an object`)
  if (typeof raw.id !== 'string') {
    throw new Error(`${label}: fs:match-row ${where} requires a string 'id'`)
  }
  // Shallow-trust the rest of the fixture shape — YAML authors see a runtime
  // render fallback if the shape is wrong, which is gentler than a build break.
  return raw as unknown as FixtureRow
}

function parseVariant(raw: unknown, label: string): MatchRowVariant {
  if (raw === undefined || raw === null) return 'compact'
  if (typeof raw !== 'string' || !VARIANTS.includes(raw as MatchRowVariant)) {
    throw new Error(
      `${label}: fs:match-row 'variant' must be one of ${VARIANTS.join(', ')} (got ${String(raw)})`,
    )
  }
  return raw as MatchRowVariant
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchRowConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: fs:match-row layer must be an object`)
  const variant = parseVariant(raw.variant, ctx.label)
  const bg = parseFsBackground(raw)

  // Stack mode — a single column of several fixtures.
  if (raw.fixtures !== undefined) {
    if (!Array.isArray(raw.fixtures) || raw.fixtures.length === 0) {
      throw new Error(`${ctx.label}: fs:match-row 'fixtures' must be a non-empty array`)
    }
    const fixtures = raw.fixtures.map((f, i) => parseFixture(f, ctx.label, `fixtures[${i}]`))
    return { type: 'fs:match-row', variant, fixtures, ...bg }
  }

  // Single-fixture mode (default).
  const fixture = parseFixture(raw.fixture, ctx.label, "'fixture'")
  return { type: 'fs:match-row', variant, fixture, ...bg }
}

function adminForm(): AdminFormField[] {
  return [
    {
      kind: 'select',
      key: 'variant',
      label: 'Variant',
      options: VARIANTS.map((v) => ({ value: v, label: v })),
    },
    { kind: 'json', key: 'fixtures', label: 'Fixtures (stack — one column of rows)' },
    ...fsBackgroundFields(),
  ]
}

const matchRowModule: VizModule<MatchRowConfig> = {
  type: 'fs:match-row',
  label: 'Footshorts — match row',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const ids = config.fixtures
      ? config.fixtures.map((f) => f.id).join('|')
      : (config.fixture?.id ?? '')
    return `fs:match-row:${config.variant}:${ids}:${config.backgroundImage ?? ''}`
  },
}

export default matchRowModule
