import type { VizModule } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'

/**
 * `fs:match-row` — Foreground viz module wrapping the MatchRow component.
 *
 * Renders a single football fixture (team crests + score + kickoff status).
 * YAML carries the full FixtureRow shape inline; future iterations can swap
 * to a data: reference that pulls live from the fixtures table.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:match-row
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
 */

export interface MatchRowConfig {
  type: 'fs:match-row'
  fixture: FixtureRow
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchRowConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: fs:match-row layer must be an object`)
  if (!isObj(raw.fixture)) {
    throw new Error(`${ctx.label}: fs:match-row requires a 'fixture' object`)
  }
  if (typeof (raw.fixture as Record<string, unknown>).id !== 'string') {
    throw new Error(`${ctx.label}: fs:match-row.fixture requires a string 'id'`)
  }
  // Shallow-trust the rest of the fixture shape — YAML authors see a runtime
  // render fallback if the shape is wrong, which is gentler than a build break.
  return { type: 'fs:match-row', fixture: raw.fixture as unknown as FixtureRow }
}

const matchRowModule: VizModule<MatchRowConfig> = {
  type: 'fs:match-row',
  label: 'Footshort — match row',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => `fs:match-row:${config.fixture.id}`,
}

export default matchRowModule
