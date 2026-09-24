import type { VizModule } from '@vismay/viz-engine'
import type { DriverLane } from '../../types'
import type { LapBand } from '../../web/PositionChart'

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
 *
 * Optional zoom for a single beat (a pit cycle, a safety-car swing):
 *
 *       lapFrom: 10          # x-axis spans laps 10–20 …
 *       lapTo: 20            # … and the y-axis fits the positions inside it
 *       highlight: [NOR, ANT] # driver codes to emphasise; the rest dim
 *       bands:               # shaded periods behind the lines
 *         - { from: 14, to: 15, label: 'SC / VSC' }
 */

export interface PositionChartConfig {
  type: 'f1:position-chart'
  raceLabel: string
  lanes: DriverLane[]
  totalLaps?: number
  lapFrom?: number
  lapTo?: number
  highlight?: string[]
  bands?: LapBand[]
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
    lapFrom: typeof r.lapFrom === 'number' ? r.lapFrom : undefined,
    lapTo: typeof r.lapTo === 'number' ? r.lapTo : undefined,
    highlight: Array.isArray(r.highlight)
      ? r.highlight.filter((h): h is string => typeof h === 'string')
      : undefined,
    bands: Array.isArray(r.bands)
      ? (r.bands as unknown[]).filter(
          (b): b is LapBand =>
            !!b && typeof b === 'object' &&
            typeof (b as LapBand).from === 'number' && typeof (b as LapBand).to === 'number',
        )
      : undefined,
  }
}

const positionChartModule: VizModule<PositionChartConfig> = {
  type: 'f1:position-chart',
  label: 'F1 — position by lap',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  // Portrait decks stack regions in flow; a content-sized chart spanning many
  // positions runs past its region. A region-sized box lets the svg scale to fit.
  defaultStyle: { portrait: { size: { height: '40vh' } } },
  stableIdentity: (config) =>
    `f1:position-chart:${config.raceLabel}::${config.lanes.length}::${config.lapFrom ?? ''}-${config.lapTo ?? ''}`,
}

export default positionChartModule
