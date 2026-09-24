import type { VizModule } from '@vismay/viz-engine'
import type { ConstructorStandingRow } from '../../types'

/**
 * `f1:constructor-podium` — Foreground viz module wrapping ConstructorPodium.
 *
 * Renders the top three of the constructors' championship as a podium card
 * (P2 / P1 / P3 steps tinted in team colours). Rows share the
 * `f1:constructor-standings` shape, so a full standings table can be
 * pasted in — only P1–P3 are drawn.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: f1:constructor-podium
 *       title: Constructors   # optional
 *       rows:
 *         - { position: 1, constructorId: mercedes, constructorName: Mercedes, nationality: German, primaryColor: '#27F4D2', logoUrl: null, points: 503, wins: 9 }
 *         - { position: 2, ... }
 *         - { position: 3, ... }
 */

export interface ConstructorPodiumConfig {
  type: 'f1:constructor-podium'
  rows: ConstructorStandingRow[]
  /** Card heading. Defaults to 'Constructors'. */
  title?: string
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): ConstructorPodiumConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:constructor-podium layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.rows)) {
    throw new Error(`${ctx.label}: f1:constructor-podium requires a 'rows' array`)
  }
  if (r.rows.length === 0) {
    throw new Error(`${ctx.label}: f1:constructor-podium 'rows' must not be empty`)
  }
  if (r.title !== undefined && typeof r.title !== 'string') {
    throw new Error(`${ctx.label}: f1:constructor-podium 'title' must be a string`)
  }
  return {
    type: 'f1:constructor-podium',
    rows: r.rows as unknown as ConstructorStandingRow[],
    ...(r.title !== undefined ? { title: r.title as string } : {}),
  }
}

const constructorPodiumModule: VizModule<ConstructorPodiumConfig> = {
  type: 'f1:constructor-podium',
  label: 'F1 — constructor podium',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const top = config.rows
      .filter((row) => row.position <= 3)
      .sort((a, b) => a.position - b.position)
      .map((row) => `${row.constructorId}:${row.points}`)
      .join(',')
    return `f1:constructor-podium::${top}`
  },
}

export default constructorPodiumModule
