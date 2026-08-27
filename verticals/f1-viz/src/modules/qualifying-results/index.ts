import type { VizModule } from '@vismay/viz-engine'
import type { QualifyingRow } from '../../types'

/**
 * `f1:qualifying-results` — Foreground viz module wrapping QualifyingResults.
 *
 * Renders a qualifying grid (position / driver / Q1 / Q2 / Q3). Config carries
 * the full QualifyingRow[] inline plus an optional session label.
 */

export interface QualifyingResultsConfig {
  type: 'f1:qualifying-results'
  rows: QualifyingRow[]
  sessionLabel?: string
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): QualifyingResultsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:qualifying-results layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.rows)) {
    throw new Error(`${ctx.label}: f1:qualifying-results requires a 'rows' array`)
  }
  if (r.rows.length === 0) {
    throw new Error(`${ctx.label}: f1:qualifying-results 'rows' must not be empty`)
  }
  return {
    type: 'f1:qualifying-results',
    rows: r.rows as unknown as QualifyingRow[],
    sessionLabel: typeof r.sessionLabel === 'string' ? r.sessionLabel : undefined,
  }
}

const qualifyingResultsModule: VizModule<QualifyingResultsConfig> = {
  type: 'f1:qualifying-results',
  label: 'F1 — qualifying results',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const first = config.rows[0]?.driverId ?? '?'
    return `f1:qualifying-results:${config.rows.length}::${first}`
  },
}

export default qualifyingResultsModule
