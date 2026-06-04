import type { VizModule } from '@vismay/viz-engine'
import type { ReplayFixture } from '../../web/replay/dataSource'

/**
 * `f1:race-replay` — Foreground viz module wrapping the interactive race
 * replay (track viewport + playback controls + live standings).
 *
 * Telemetry is large, so it is NOT inlined frame-by-frame in story YAML the
 * way `f1:position-chart` carries its lap series. Instead a layer points at a
 * data source one of three ways (checked in this order):
 *
 *   1. `fixture:`    — an inline `ReplayFixture` (used by the catalog sample so
 *                      the preview renders with zero network).
 *   2. `fixtureUrl:` — an explicit URL to a `ReplayFixture` JSON.
 *   3. `sessionRef:` — resolved by the host app to `/fixtures/replay-<ref>.json`
 *                      (falls back to `<fallbackRef>`, default `demo`).
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: f1:race-replay
 *       title: '2024 Monaco GP — opening laps'
 *       sessionRef: '2024-monaco'   # → /fixtures/replay-2024-monaco.json
 *       autoPlay: true
 */
export interface RaceReplayConfig {
  type: 'f1:race-replay'
  /** Optional heading shown above the replay. */
  title?: string
  /** Inline telemetry payload — renders with no network (catalog/SSG). */
  fixture?: ReplayFixture
  /** Session reference resolved to `/fixtures/replay-<ref>.json` by the host app. */
  sessionRef?: string
  /** Explicit fixture URL, overriding the `sessionRef` → URL convention. */
  fixtureUrl?: string
  /** Reference retried when the primary fixture 404s. Defaults to `demo`. */
  fallbackRef?: string
  /** Start playing on mount. Defaults to the slot's autoplay/scroll behaviour. */
  autoPlay?: boolean
}

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): RaceReplayConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:race-replay layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const hasSource =
    (r.fixture && typeof r.fixture === 'object') ||
    typeof r.fixtureUrl === 'string' ||
    typeof r.sessionRef === 'string'
  if (!hasSource) {
    throw new Error(
      `${ctx.label}: f1:race-replay requires one of 'fixture', 'fixtureUrl', or 'sessionRef'`,
    )
  }
  return {
    type: 'f1:race-replay',
    title: typeof r.title === 'string' ? r.title : undefined,
    fixture: (r.fixture as ReplayFixture | undefined) ?? undefined,
    sessionRef: typeof r.sessionRef === 'string' ? r.sessionRef : undefined,
    fixtureUrl: typeof r.fixtureUrl === 'string' ? r.fixtureUrl : undefined,
    fallbackRef: typeof r.fallbackRef === 'string' ? r.fallbackRef : undefined,
    autoPlay: typeof r.autoPlay === 'boolean' ? r.autoPlay : undefined,
  }
}

const raceReplayModule: VizModule<RaceReplayConfig> = {
  type: 'f1:race-replay',
  label: 'F1 — race replay',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) =>
    `f1:race-replay:${config.fixtureUrl ?? config.sessionRef ?? 'inline'}::${
      config.fixture?.tracks.length ?? 0
    }`,
}

export default raceReplayModule
