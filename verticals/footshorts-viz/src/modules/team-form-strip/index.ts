import type { VizModule } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'

/**
 * `fs:team-form-strip` — Foreground viz module wrapping TeamFormStrip.
 *
 * A horizontally-scrolling strip of recent-result pills for one team — each
 * pill shows the opponent crest, score, fixture side (vs/@) and a W/D/L badge,
 * all from `teamId`'s perspective. Good for establishing a side's recent run.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:team-form-strip
 *       teamId: middlesbrough
 *       label: "Form · last 5"   # optional, defaults to "Form · last 5"
 *       fixtures:                 # oldest → newest
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

export interface TeamFormStripConfig {
  type: 'fs:team-form-strip'
  fixtures: FixtureRow[]
  teamId: string
  label?: string
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
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
  return {
    type: 'fs:team-form-strip',
    fixtures: raw.fixtures as unknown as FixtureRow[],
    teamId: raw.teamId,
    ...(label ? { label } : {}),
  }
}

const teamFormStripModule: VizModule<TeamFormStripConfig> = {
  type: 'fs:team-form-strip',
  label: 'Footshorts — team form strip',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) =>
    `fs:team-form-strip:${config.teamId}:${config.fixtures.map((f) => f.id).join('|')}`,
}

export default teamFormStripModule
