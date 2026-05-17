import type { VizModule } from '@vismay/viz-engine'
import type { DriverStandingRow } from '../../types'

/**
 * `f1:driver-standings` — Foreground viz module wrapping DriverStandings.
 *
 * Renders the season's drivers' table (position / driver / team / wins / pts).
 * YAML carries the full DriverStandingRow[] inline.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: f1:driver-standings
 *       rows:
 *         - { position: 1, driverId: max_verstappen, driverCode: VER, driverName: 'Max Verstappen', constructorId: red_bull, constructorName: 'Red Bull', points: 575, wins: 19 }
 *         - { position: 2, ... }
 */

export interface DriverStandingsConfig {
  type: 'f1:driver-standings'
  rows: DriverStandingRow[]
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): DriverStandingsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:driver-standings layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.rows)) {
    throw new Error(`${ctx.label}: f1:driver-standings requires a 'rows' array`)
  }
  if (r.rows.length === 0) {
    throw new Error(`${ctx.label}: f1:driver-standings 'rows' must not be empty`)
  }
  return { type: 'f1:driver-standings', rows: r.rows as unknown as DriverStandingRow[] }
}

const driverStandingsModule: VizModule<DriverStandingsConfig> = {
  type: 'f1:driver-standings',
  label: 'F1 — driver standings',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const first = config.rows[0]?.driverId ?? '?'
    return `f1:driver-standings:${config.rows.length}::${first}`
  },
}

export default driverStandingsModule
