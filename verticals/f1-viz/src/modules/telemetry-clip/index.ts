import type { VizModule } from '@vismay/viz-engine'
import type { TelemetryChannel, TelemetryClipPayload } from '../../web/clip/clipSource'

/**
 * `f1:telemetry-clip` — Foreground viz module: an animated telemetry replay for
 * a lap window (2D track map + synced car dots + a per-driver telemetry
 * dashboard). Ported from the f1_backend TelemetryClipPlayer.
 *
 * Like `f1:race-replay`, telemetry is never inlined frame-by-frame in story
 * config. A layer references a session + lap window + drivers; the heavy payload
 * is resolved at render time from the app's clip route
 * (`<apiBase>/api/telemetry/<sessionKey>/clip`). The catalog sample inlines a
 * compact `clip` payload so the preview renders with zero network.
 *
 * Story JSON:
 *
 *   foreground:
 *     - type: f1:telemetry-clip
 *       sessionKey: '2024_monaco_R'
 *       lapFrom: 12
 *       lapTo: 14
 *       driverNumbers: [1, 16]
 *       caption: 'Verstappen vs Leclerc — sector 2'
 */
export interface TelemetryClipConfig {
  type: 'f1:telemetry-clip'
  sessionKey: string
  lapFrom: number
  lapTo: number
  driverNumbers: number[]
  focalDriverNumber?: number | null
  channels?: TelemetryChannel[]
  caption?: string
  /** Inline payload — renders with no network (catalog/SSG). */
  clip?: TelemetryClipPayload
  /** Explicit clip URL, overriding the `<apiBase>/api/telemetry/<key>/clip` convention. */
  clipUrl?: string
  /** Origin for the clip route when rendering off the vizf1 origin (render surface). */
  apiBase?: string
  autoPlay?: boolean
}

const VALID_CHANNELS = new Set<TelemetryChannel>(['speed', 'throttle', 'brake', 'drs', 'nGear', 'rpm'])

function parseConfig(
  raw: unknown,
  ctx: { slug: string; label: string },
): TelemetryClipConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:telemetry-clip layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const hasInline = r.clip && typeof r.clip === 'object'

  if (!hasInline) {
    if (typeof r.sessionKey !== 'string' || !r.sessionKey) {
      throw new Error(`${ctx.label}: f1:telemetry-clip requires a 'sessionKey'`)
    }
    if (typeof r.lapFrom !== 'number' || typeof r.lapTo !== 'number') {
      throw new Error(`${ctx.label}: f1:telemetry-clip requires numeric 'lapFrom' and 'lapTo'`)
    }
    if (!Array.isArray(r.driverNumbers) || r.driverNumbers.length === 0) {
      throw new Error(`${ctx.label}: f1:telemetry-clip requires a non-empty 'driverNumbers' array`)
    }
  }

  const channels = Array.isArray(r.channels)
    ? (r.channels.filter((c) => VALID_CHANNELS.has(c as TelemetryChannel)) as TelemetryChannel[])
    : undefined

  return {
    type: 'f1:telemetry-clip',
    sessionKey: typeof r.sessionKey === 'string' ? r.sessionKey : ((r.clip as TelemetryClipPayload)?.sessionKey ?? ''),
    lapFrom: typeof r.lapFrom === 'number' ? r.lapFrom : ((r.clip as TelemetryClipPayload)?.lapFrom ?? 1),
    lapTo: typeof r.lapTo === 'number' ? r.lapTo : ((r.clip as TelemetryClipPayload)?.lapTo ?? 1),
    driverNumbers: Array.isArray(r.driverNumbers)
      ? (r.driverNumbers as number[])
      : ((r.clip as TelemetryClipPayload)?.drivers?.map((d) => d.driverNumber) ?? []),
    focalDriverNumber:
      typeof r.focalDriverNumber === 'number' ? r.focalDriverNumber : undefined,
    channels,
    caption: typeof r.caption === 'string' ? r.caption : undefined,
    clip: (r.clip as TelemetryClipPayload | undefined) ?? undefined,
    clipUrl: typeof r.clipUrl === 'string' ? r.clipUrl : undefined,
    apiBase: typeof r.apiBase === 'string' ? r.apiBase : undefined,
    autoPlay: typeof r.autoPlay === 'boolean' ? r.autoPlay : undefined,
  }
}

const telemetryClipModule: VizModule<TelemetryClipConfig> = {
  type: 'f1:telemetry-clip',
  label: 'F1 — telemetry clip',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) =>
    `f1:telemetry-clip:${config.sessionKey}:${config.lapFrom}-${config.lapTo}:${config.driverNumbers.join('-')}`,
}

export default telemetryClipModule
