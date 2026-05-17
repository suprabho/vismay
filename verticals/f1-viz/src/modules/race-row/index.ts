import type { VizModule } from '@vismay/viz-engine'
import type { RaceRow } from '../../types'

/**
 * `f1:race-row` — Foreground viz module wrapping the RaceRow component.
 *
 * Renders a single race row (round + GP name + circuit + status badge).
 * YAML carries the full RaceRow shape inline.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: f1:race-row
 *       race:
 *         id: '2024-7'
 *         season: '2024'
 *         round: 7
 *         raceName: 'Monaco Grand Prix'
 *         circuitId: monaco
 *         circuitName: 'Circuit de Monaco'
 *         country: Monaco
 *         locality: 'Monte Carlo'
 *         date: '2024-05-26'
 *         time: '13:00:00Z'
 *         status: finished
 *         hasSprint: false
 */

export interface RaceRowConfig {
  type: 'f1:race-row'
  race: RaceRow
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): RaceRowConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: f1:race-row layer must be an object`)
  if (!isObj(raw.race)) {
    throw new Error(`${ctx.label}: f1:race-row requires a 'race' object`)
  }
  const r = raw.race as Record<string, unknown>
  if (typeof r.id !== 'string') {
    throw new Error(`${ctx.label}: f1:race-row.race requires a string 'id'`)
  }
  return { type: 'f1:race-row', race: raw.race as unknown as RaceRow }
}

const raceRowModule: VizModule<RaceRowConfig> = {
  type: 'f1:race-row',
  label: 'F1 — race row',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => `f1:race-row:${config.race.id}`,
}

export default raceRowModule
