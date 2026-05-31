import type { VizModule } from '@vismay/viz-engine'
import type { TeamLane } from '../../types'

/**
 * `fs:standings-over-matchdays` — Foreground viz module wrapping
 * StandingsOverMatchdays.
 *
 * Renders a league-position-by-matchday line chart, one polyline per team.
 * The football twin of `f1:position-chart`. YAML/config carries the per-team
 * matchday series inline.
 *
 * Story / storyboard config:
 *
 *   foreground:
 *     - type: fs:standings-over-matchdays
 *       competitionLabel: 'Premier League · 2025/26'
 *       totalMatchdays: 38
 *       # Optional x-axis window. `from` defaults to the first matchday in the
 *       # data (so trimmed series fill the chart); `to` overrides totalMatchdays.
 *       matchdayRange: { from: 20, to: 38 }
 *       lanes:
 *         - team_id: man-utd
 *           team_name: 'Manchester United'
 *           team_code: MUN
 *           color: '#DA291C'
 *           points:
 *             - { matchday: 1, position: 6 }
 *             - { matchday: 2, position: 6 }
 *             - { ... }
 */

export interface StandingsOverMatchdaysConfig {
  type: 'fs:standings-over-matchdays'
  competitionLabel: string
  lanes: TeamLane[]
  /** Pins the right edge of the x-axis. Superseded by `matchdayRange.to`. */
  totalMatchdays?: number
  /**
   * Optional x-axis window. `from` pins the left origin (defaults to the first
   * matchday in the data, so trimmed series fill the chart); `to` pins the
   * right edge and takes precedence over `totalMatchdays`.
   */
  matchdayRange?: { from?: number; to?: number }
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): StandingsOverMatchdaysConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:standings-over-matchdays layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.competitionLabel !== 'string') {
    throw new Error(
      `${ctx.label}: fs:standings-over-matchdays requires a string 'competitionLabel'`,
    )
  }
  if (!Array.isArray(r.lanes) || r.lanes.length === 0) {
    throw new Error(
      `${ctx.label}: fs:standings-over-matchdays requires a non-empty 'lanes' array`,
    )
  }
  // Accept a partial { from?, to? } window; ignore non-numeric / empty input so
  // the chart falls back to data-derived bounds.
  let matchdayRange: { from?: number; to?: number } | undefined
  if (r.matchdayRange && typeof r.matchdayRange === 'object') {
    const mr = r.matchdayRange as Record<string, unknown>
    const from = typeof mr.from === 'number' ? mr.from : undefined
    const to = typeof mr.to === 'number' ? mr.to : undefined
    if (from !== undefined || to !== undefined) matchdayRange = { from, to }
  }
  return {
    type: 'fs:standings-over-matchdays',
    competitionLabel: r.competitionLabel,
    lanes: r.lanes as unknown as TeamLane[],
    totalMatchdays: typeof r.totalMatchdays === 'number' ? r.totalMatchdays : undefined,
    matchdayRange,
  }
}

const standingsOverMatchdaysModule: VizModule<StandingsOverMatchdaysConfig> = {
  type: 'fs:standings-over-matchdays',
  label: 'Footshorts — standings over matchdays',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) =>
    `fs:standings-over-matchdays:${config.competitionLabel}::${config.lanes.length}`,
}

export default standingsOverMatchdaysModule
