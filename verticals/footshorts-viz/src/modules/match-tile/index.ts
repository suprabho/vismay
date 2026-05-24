import type { VizModule } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'

/**
 * `fs:match-tile` — Foreground viz module wrapping the MatchTile component.
 *
 * A compact, team-themed fixture tile (gradient background driven by team
 * primary colors, watermark crest, top-left score/time/LIVE pill). Good for
 * horizontal strips and grid callouts.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:match-tile
 *       fixture:
 *         id: m1
 *         competition_slug: prem
 *         season: '2025'
 *         kickoff_at: '2026-04-21T14:00:00Z'
 *         status: finished
 *         home_score: 2
 *         away_score: 1
 *         home: { id: arsenal, slug: arsenal, name: Arsenal, crest_url: null, primary_color: '#EF0107' }
 *         away: { id: chelsea, slug: chelsea, name: Chelsea, crest_url: null, primary_color: '#034694' }
 *       competitionCrest: 'https://…/prem.svg'  # optional
 */

export interface MatchTileConfig {
  type: 'fs:match-tile'
  fixture: FixtureRow
  competitionCrest?: string | null
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchTileConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: fs:match-tile layer must be an object`)
  if (!isObj(raw.fixture)) {
    throw new Error(`${ctx.label}: fs:match-tile requires a 'fixture' object`)
  }
  if (typeof (raw.fixture as Record<string, unknown>).id !== 'string') {
    throw new Error(`${ctx.label}: fs:match-tile.fixture requires a string 'id'`)
  }
  const crest = raw.competitionCrest
  return {
    type: 'fs:match-tile',
    fixture: raw.fixture as unknown as FixtureRow,
    competitionCrest:
      typeof crest === 'string' && crest.length > 0 ? crest : null,
  }
}

const matchTileModule: VizModule<MatchTileConfig> = {
  type: 'fs:match-tile',
  label: 'Footshorts — match tile',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => `fs:match-tile:${config.fixture.id}`,
}

export default matchTileModule
