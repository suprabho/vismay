import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import type { FixtureRow } from '../../types'
import type { StaticRoundInput } from '../../buildStaticBracket'
import {
  type FsBackgroundConfig,
  fsBackgroundFields,
  parseFsBackground,
} from '../shared/background'

/**
 * `fs:bracket` — Foreground viz module wrapping the Bracket component.
 *
 * Two authoring paths, pick one:
 *
 * 1. `fixtures` — a flat list of knockout fixtures, grouped into rounds + ties
 *    at render time via `buildBracket`. Use this once the draw is real (every
 *    tie is a confirmed pair of teams).
 *
 * 2. `rounds` — an explicit, *incomplete* bracket for when the draw is only
 *    partly known: most slots are still qualification descriptors ("Winner
 *    Group I", "3rd A/C/D/F", "Runner-up K") and later rounds are empty. There
 *    are no fixtures yet, so the structure is authored verbatim and built via
 *    `buildStaticBracket`. Each slot is a confirmed team, a placeholder, or TBD.
 *
 * Story YAML (fixtures):
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
 *
 * Story YAML (incomplete bracket):
 *
 *   foreground:
 *     - type: fs:bracket
 *       layout: tree
 *       title: 'World Cup 26 · Round of 32'
 *       competitionSlug: world-cup
 *       rounds:
 *         - stage: ROUND_OF_32
 *           ties:
 *             - { a: { team: germany }, b: '3rd A/C/D/F' }
 *             - { a: 'Winner Group I', b: '3rd D/F/G/H' }
 *         - { stage: ROUND_OF_16, ties: [ {}, {} ] }   # all TBD
 *         - { stage: FINAL,       ties: [ {} ] }
 */

export interface BracketConfig extends FsBackgroundConfig {
  type: 'fs:bracket'
  /** Fixture-derived path. Required unless `rounds` is given. */
  fixtures?: FixtureRow[]
  /**
   * Incomplete/static path: explicit rounds of slot-vs-slot ties where a slot
   * may be a confirmed team, a qualification placeholder, or TBD. Mutually
   * exclusive with `fixtures`; when present it wins.
   */
  rounds?: StaticRoundInput[]
  /**
   * 'list' (default) = the stacked round list; 'tree' = full mirrored
   * tournament tree (web only), which automatically switches to the vertical
   * portrait tree when its container is too narrow for the wide layout;
   * 'tree-vertical' = always render the portrait tree; 'tree-horizontal' =
   * always render the wide mirrored tree (no auto-switch).
   */
  layout?: 'list' | 'tree' | 'tree-vertical' | 'tree-horizontal'
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

  const hasRounds = Array.isArray(raw.rounds)
  let rounds: StaticRoundInput[] | undefined
  let fixtures: FixtureRow[] | undefined

  if (hasRounds) {
    // Incomplete/static path. Validate each round has a stage + a ties array;
    // individual slots are normalised leniently by buildStaticBracket.
    const rawRounds = raw.rounds as unknown[]
    if (rawRounds.length === 0) {
      throw new Error(`${ctx.label}: fs:bracket 'rounds' must not be empty`)
    }
    for (const [i, r] of rawRounds.entries()) {
      if (!isObj(r) || typeof r.stage !== 'string' || !Array.isArray(r.ties)) {
        throw new Error(
          `${ctx.label}: fs:bracket.rounds[${i}] requires a string 'stage' and a 'ties' array`,
        )
      }
    }
    rounds = rawRounds as unknown as StaticRoundInput[]
  } else {
    if (!Array.isArray(raw.fixtures)) {
      throw new Error(`${ctx.label}: fs:bracket requires a 'fixtures' array or a 'rounds' array`)
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
    fixtures = raw.fixtures as unknown as FixtureRow[]
  }

  const layout =
    raw.layout === 'tree'
      ? 'tree'
      : raw.layout === 'tree-vertical'
        ? 'tree-vertical'
        : raw.layout === 'tree-horizontal'
          ? 'tree-horizontal'
          : 'list'
  const highlightTeamId = typeof raw.highlightTeamId === 'string' ? raw.highlightTeamId : undefined
  const title = typeof raw.title === 'string' ? raw.title : undefined
  const competitionSlug = typeof raw.competitionSlug === 'string' ? raw.competitionSlug : undefined
  return {
    type: 'fs:bracket',
    ...(fixtures ? { fixtures } : {}),
    ...(rounds ? { rounds } : {}),
    layout,
    highlightTeamId,
    title,
    competitionSlug,
    ...parseFsBackground(raw),
  }
}

const BRACKET_LAYOUTS = ['list', 'tree', 'tree-vertical', 'tree-horizontal'] as const

function adminForm(): AdminFormField[] {
  return [
    { kind: 'json', key: 'fixtures', label: 'Knockout fixtures (complete draw)' },
    { kind: 'json', key: 'rounds', label: 'Rounds (incomplete bracket — slot-vs-slot)' },
    {
      kind: 'select',
      key: 'layout',
      label: 'Layout',
      options: BRACKET_LAYOUTS.map((l) => ({ value: l, label: l })),
    },
    { kind: 'text', key: 'highlightTeamId', label: 'Highlight team id (tree)' },
    { kind: 'text', key: 'title', label: 'Centre emblem caption' },
    { kind: 'text', key: 'competitionSlug', label: 'Competition slug' },
    ...fsBackgroundFields(),
  ]
}

const bracketModule: VizModule<BracketConfig> = {
  type: 'fs:bracket',
  label: 'Footshorts — bracket',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) => {
    const layout = config.layout ?? 'list'
    const bg = config.backgroundImage ?? ''
    if (config.rounds) {
      const nTies = config.rounds.reduce((n, r) => n + (r.ties?.length ?? 0), 0)
      const slug = config.competitionSlug ?? 'world-cup'
      return `fs:bracket:rounds:${slug}:${config.rounds.length}:${nTies}:${layout}:${bg}`
    }
    const first = config.fixtures![0]!
    return `fs:bracket:${first.competition_slug}:${first.season}:${config.fixtures!.length}:${layout}:${bg}`
  },
}

export default bracketModule
