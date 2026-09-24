import type { VizModule } from '@vismay/viz-engine'
import type { DriverStandingRow } from '../../types'

/**
 * `f1:driver-podium` — Foreground viz module wrapping DriverPodium.
 *
 * Renders the top three of the drivers' championship as a podium card
 * (P2 / P1 / P3 steps tinted in team colours). Rows share the
 * `f1:driver-standings` shape, so a full standings table can be
 * pasted in — only P1–P3 are drawn.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: f1:driver-podium
 *       title: Drivers   # optional
 *       rows:
 *         - { position: 1, driverId: kimi_antonelli, driverCode: ANT, driverName: 'Kimi Antonelli', constructorId: mercedes, constructorName: Mercedes, constructorColor: '#27F4D2', headshotUrl: null, points: 292, wins: 6 }
 *         - { position: 2, ... }
 *         - { position: 3, ... }
 */

export interface DriverPodiumConfig {
  type: 'f1:driver-podium'
  rows: DriverStandingRow[]
  /** Card heading. Defaults to 'Drivers'. */
  title?: string
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): DriverPodiumConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:driver-podium layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.rows)) {
    throw new Error(`${ctx.label}: f1:driver-podium requires a 'rows' array`)
  }
  if (r.rows.length === 0) {
    throw new Error(`${ctx.label}: f1:driver-podium 'rows' must not be empty`)
  }
  if (r.title !== undefined && typeof r.title !== 'string') {
    throw new Error(`${ctx.label}: f1:driver-podium 'title' must be a string`)
  }
  return {
    type: 'f1:driver-podium',
    rows: r.rows as unknown as DriverStandingRow[],
    ...(r.title !== undefined ? { title: r.title as string } : {}),
  }
}

const driverPodiumModule: VizModule<DriverPodiumConfig> = {
  type: 'f1:driver-podium',
  label: 'F1 — driver podium',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const top = config.rows
      .filter((row) => row.position <= 3)
      .sort((a, b) => a.position - b.position)
      .map((row) => `${row.driverId}:${row.points}`)
      .join(',')
    return `f1:driver-podium::${top}`
  },
}

export default driverPodiumModule
