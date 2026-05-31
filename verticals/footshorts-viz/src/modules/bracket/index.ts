import type { VizModule } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'

/**
 * `fs:bracket` — Foreground viz module wrapping the Bracket component.
 *
 * Takes a flat list of knockout fixtures and groups them into rounds + ties
 * at render time via `buildBracket`. Authoring a YAML literal for the full
 * Bracket tree (rounds → ties → legs → aggregate) would be unworkable, so
 * the module config is just the source fixtures the bracket is built from.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:bracket
 *       fixtures:
 *         - id: ucl-qf1-leg1
 *           competition_slug: ucl
 *           season: '2025'
 *           stage: quarter-final
 *           kickoff_at: '2026-04-08T19:00:00Z'
 *           status: finished
 *           home_score: 2
 *           away_score: 1
 *           home: { id: arsenal, slug: arsenal, name: Arsenal, crest_url: null }
 *           away: { id: real-madrid, slug: real-madrid, name: 'Real Madrid', crest_url: null }
 *         - id: ucl-qf1-leg2
 *           ...
 */

export interface BracketConfig {
  type: 'fs:bracket'
  fixtures: FixtureRow[]
  /**
   * 'list' (default) = the stacked round list; 'tree' = full mirrored
   * tournament tree (web only), which automatically switches to the vertical
   * top-to-bottom layout on narrow/portrait viewports; 'tree-vertical' = always
   * render the mobile vertical tree regardless of width.
   */
  layout?: 'list' | 'tree' | 'tree-vertical'
  /** Team id whose path through the tree is emphasised (tree layout). */
  highlightTeamId?: string
  /** Caption shown by the centre emblem, e.g. "Final · Budapest". */
  title?: string
  /** Competition slug for the centre emblem colour + name (defaults to the fixtures' slug). */
  competitionSlug?: string
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): BracketConfig {
  if (!isObj(raw)) throw new Error(`${ctx.label}: fs:bracket layer must be an object`)
  if (!Array.isArray(raw.fixtures)) {
    throw new Error(`${ctx.label}: fs:bracket requires a 'fixtures' array`)
  }
  if (raw.fixtures.length === 0) {
    throw new Error(`${ctx.label}: fs:bracket 'fixtures' must not be empty`)
  }
  for (const [i, f] of raw.fixtures.entries()) {
    if (!isObj(f) || typeof (f as Record<string, unknown>).id !== 'string') {
      throw new Error(
        `${ctx.label}: fs:bracket.fixtures[${i}] requires a string 'id'`,
      )
    }
  }
  const layout =
    raw.layout === 'tree' ? 'tree' : raw.layout === 'tree-vertical' ? 'tree-vertical' : 'list'
  const highlightTeamId = typeof raw.highlightTeamId === 'string' ? raw.highlightTeamId : undefined
  const title = typeof raw.title === 'string' ? raw.title : undefined
  const competitionSlug = typeof raw.competitionSlug === 'string' ? raw.competitionSlug : undefined
  return {
    type: 'fs:bracket',
    fixtures: raw.fixtures as unknown as FixtureRow[],
    layout,
    highlightTeamId,
    title,
    competitionSlug,
  }
}

const bracketModule: VizModule<BracketConfig> = {
  type: 'fs:bracket',
  label: 'Footshorts — bracket',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const first = config.fixtures[0]!
    return `fs:bracket:${first.competition_slug}:${first.season}:${config.fixtures.length}:${config.layout ?? 'list'}`
  },
}

export default bracketModule
