import type { VizModule } from '@vismay/viz-engine'
import type { ReplayFixture } from '../../web/replay/dataSource'

/**
 * `f1:track-3d` — Foreground viz module: a Three.js / react-three-fiber 3D track
 * view with an extruded sector-coloured ribbon, animated car markers, corner
 * labels, and an optional chase camera. Ported from the f1_backend 3D viewport
 * and built on the proven `starship:viewer` R3F recipe.
 *
 * Consumes the SAME replay data seam as `f1:race-replay` (session + circuit +
 * per-driver position tracks) — only the renderer differs. Source is resolved
 * in the same order: inline `fixture` → `sessionKey` (Supabase route) →
 * `fixtureUrl`/`sessionRef` (static fixture). Elevation comes from
 * `circuit.outline.z` when present; absent it the track renders flat.
 */
export interface Track3DConfig {
  type: 'f1:track-3d'
  title?: string
  /** Inline telemetry payload — renders with no network (catalog/SSG). */
  fixture?: ReplayFixture
  /** Real telemetry session key, fetched from the Supabase-backed replay route. */
  sessionKey?: string
  /** Origin for the replay route when rendering off the vizf1 origin. */
  apiBase?: string
  sessionRef?: string
  fixtureUrl?: string
  fallbackRef?: string
  /** Driver to focus (chase target + highlight). */
  focalDriverNumber?: number | null
  /** Camera trails the focused car during playback. */
  chaseCam?: boolean
  /** Allow user orbit (OrbitControls). Off by default so scroll passes through. */
  interactive?: boolean
  autoPlay?: boolean
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): Track3DConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:track-3d layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const hasSource =
    (r.fixture && typeof r.fixture === 'object') ||
    typeof r.sessionKey === 'string' ||
    typeof r.fixtureUrl === 'string' ||
    typeof r.sessionRef === 'string'
  if (!hasSource) {
    throw new Error(
      `${ctx.label}: f1:track-3d requires one of 'fixture', 'sessionKey', 'fixtureUrl', or 'sessionRef'`,
    )
  }
  return {
    type: 'f1:track-3d',
    title: typeof r.title === 'string' ? r.title : undefined,
    fixture: (r.fixture as ReplayFixture | undefined) ?? undefined,
    sessionKey: typeof r.sessionKey === 'string' ? r.sessionKey : undefined,
    apiBase: typeof r.apiBase === 'string' ? r.apiBase : undefined,
    sessionRef: typeof r.sessionRef === 'string' ? r.sessionRef : undefined,
    fixtureUrl: typeof r.fixtureUrl === 'string' ? r.fixtureUrl : undefined,
    fallbackRef: typeof r.fallbackRef === 'string' ? r.fallbackRef : undefined,
    focalDriverNumber: typeof r.focalDriverNumber === 'number' ? r.focalDriverNumber : undefined,
    chaseCam: typeof r.chaseCam === 'boolean' ? r.chaseCam : undefined,
    interactive: typeof r.interactive === 'boolean' ? r.interactive : undefined,
    autoPlay: typeof r.autoPlay === 'boolean' ? r.autoPlay : undefined,
  }
}

const track3dModule: VizModule<Track3DConfig> = {
  type: 'f1:track-3d',
  label: 'F1 — 3D track view',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  // GLB-free, but the R3F scene + first frame still take time; capture should
  // wait for paint.
  readinessProfile: 'first-paint',
  stableIdentity: (config) =>
    `f1:track-3d:${config.sessionKey ?? config.fixtureUrl ?? config.sessionRef ?? 'inline'}::${
      config.fixture?.tracks.length ?? 0
    }`,
}

export default track3dModule
