import type { VizModule } from '@vismay/viz-engine'
import type { DriverLane } from '../../types'

/**
 * `f1:position-chart` — Foreground viz module wrapping PositionChart.
 *
 * Renders a position-by-lap line chart for one race, one polyline per driver.
 * YAML carries the per-driver lap series inline.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: f1:position-chart
 *       raceLabel: '2024 Monaco GP'
 *       totalLaps: 78
 *       lanes:
 *         - driverId: max_verstappen
 *           driverCode: VER
 *           driverName: 'Max Verstappen'
 *           color: '#3671C6'
 *           points:
 *             - { lap: 1, position: 1 }
 *             - { lap: 2, position: 1 }
 *             - { ... }
 */

export interface PositionChartConfig {
  type: 'f1:position-chart'
  raceLabel: string
  lanes: DriverLane[]
  totalLaps?: number
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): PositionChartConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:position-chart layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.raceLabel !== 'string') {
    throw new Error(`${ctx.label}: f1:position-chart requires a string 'raceLabel'`)
  }
  if (!Array.isArray(r.lanes)) {
    throw new Error(`${ctx.label}: f1:position-chart requires a 'lanes' array`)
  }
  return {
    type: 'f1:position-chart',
    raceLabel: r.raceLabel,
    lanes: r.lanes as unknown as DriverLane[],
    totalLaps: typeof r.totalLaps === 'number' ? r.totalLaps : undefined,
  }
}

const positionChartModule: VizModule<PositionChartConfig> = {
  type: 'f1:position-chart',
  label: 'F1 — position by lap',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) =>
    `f1:position-chart:${config.raceLabel}::${config.lanes.length}`,
}

export default positionChartModule
