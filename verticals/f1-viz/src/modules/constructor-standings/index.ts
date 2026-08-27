import type { VizModule } from '@vismay/viz-engine'
import type { ConstructorStandingRow } from '../../types'

/**
 * `f1:constructor-standings` — Foreground viz module wrapping ConstructorStandings.
 *
 * Renders the season's constructors' table (position / team / nationality /
 * wins / pts). Config carries the full ConstructorStandingRow[] inline.
 */

export interface ConstructorStandingsConfig {
  type: 'f1:constructor-standings'
  rows: ConstructorStandingRow[]
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): ConstructorStandingsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:constructor-standings layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.rows)) {
    throw new Error(`${ctx.label}: f1:constructor-standings requires a 'rows' array`)
  }
  if (r.rows.length === 0) {
    throw new Error(`${ctx.label}: f1:constructor-standings 'rows' must not be empty`)
  }
  return { type: 'f1:constructor-standings', rows: r.rows as unknown as ConstructorStandingRow[] }
}

const constructorStandingsModule: VizModule<ConstructorStandingsConfig> = {
  type: 'f1:constructor-standings',
  label: 'F1 — constructor standings',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const first = config.rows[0]?.constructorId ?? '?'
    return `f1:constructor-standings:${config.rows.length}::${first}`
  },
}

export default constructorStandingsModule
