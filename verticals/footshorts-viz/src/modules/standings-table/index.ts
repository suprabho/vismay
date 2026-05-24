import type { VizModule } from '@vismay/viz-engine'
import type { StandingRow } from '../../types'

/**
 * `fs:standings-table` — Foreground viz module wrapping StandingsTable.
 *
 * Renders a league table (position / team / P / W / D / L / GD / Pts).
 * YAML carries the full StandingRow[] inline.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:standings-table
 *       rows:
 *         - { position: 1, team_id: 'arsenal', team: { id: 'arsenal', ... }, played: 30, won: 22, ... }
 *         - { position: 2, team_id: 'liverpool', ... }
 */

export interface StandingsTableConfig {
  type: 'fs:standings-table'
  rows: StandingRow[]
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): StandingsTableConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:standings-table layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.rows)) {
    throw new Error(`${ctx.label}: fs:standings-table requires a 'rows' array`)
  }
  if (r.rows.length === 0) {
    throw new Error(`${ctx.label}: fs:standings-table 'rows' must not be empty`)
  }
  return { type: 'fs:standings-table', rows: r.rows as unknown as StandingRow[] }
}

const standingsTableModule: VizModule<StandingsTableConfig> = {
  type: 'fs:standings-table',
  label: 'Footshorts — standings table',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const first = config.rows[0]?.team_id ?? '?'
    return `fs:standings-table:${config.rows.length}::${first}`
  },
}

export default standingsTableModule
