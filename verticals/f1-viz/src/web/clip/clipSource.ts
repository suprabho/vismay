/**
 * Telemetry-clip data-source seam.
 *
 * Mirrors the replay `dataSource.ts` design: the f1:telemetry-clip render layer
 * depends ONLY on `ClipDataSource` — never on where the payload comes from.
 * `createInlineClipSource` resolves synchronously from a payload already in hand
 * (module sample / SSG); `createFetchClipSource` fetches the app's clip route
 * (apps/vizf1/web/app/api/telemetry/[sessionKey]/clip), which assembles the
 * bundle from Supabase. Swapping the backend is zero component change.
 *
 * Clip-payload shapes are ported from the f1_backend donor (`src/config/api.ts`),
 * reusing the shared replay types where they overlap.
 */
import type { CarPositionFrames, CircuitGeometry, DriverSectorBest } from '../replay/types'

/** What the player needs to fetch a clip — also the f1:telemetry-clip config core. */
export interface TelemetryClipMeta {
  sessionKey: string
  lapFrom: number
  lapTo: number
  driverNumbers: number[]
  focalDriverNumber?: number | null
  channels?: TelemetryChannel[]
  /** Target sample rate (Hz) for the raw telemetry traces. Server caps at 30. */
  hz?: number
}

export type TelemetryChannel = 'speed' | 'throttle' | 'brake' | 'drs' | 'nGear' | 'rpm'

export interface TelemetryClipDriver {
  driverNumber: number
  abbreviation: string
  fullName: string
  teamName: string
  teamColour: string
}

export interface TelemetryClipLap {
  driverNumber: number
  lap: number
  lapTimeSec: number | null
  sectors: Array<number | null>
  compound: string
  stintLap: number
}

export interface TelemetryClipTrack {
  driverNumber: number
  sampleRateHz: number
  frameCount: number
  t0Ms: number
  tEndMs: number
  frames: CarPositionFrames
}

export interface TelemetryClipTrace {
  driverNumber: number
  lap: number
  frameCount: number
  sampleRateHz: number
  sessionTime: number[]
  distance: number[]
  speed?: number[]
  throttle?: number[]
  brake?: number[]
  drs?: number[]
  nGear?: number[]
  rpm?: number[]
}

export interface TelemetryClipPayload {
  sessionKey: string
  circuitKey: string
  circuitName: string
  year: number
  lapFrom: number
  lapTo: number
  channels: string[]
  drivers: TelemetryClipDriver[]
  circuit: CircuitGeometry | null
  lapsByDriver: Record<number, TelemetryClipLap[]>
  sectorBests: Record<number, DriverSectorBest>
  tracks: TelemetryClipTrack[]
  telemetry: TelemetryClipTrace[]
}

export interface ClipDataSource {
  load(meta: TelemetryClipMeta): Promise<TelemetryClipPayload>
}

export interface FetchClipSourceOptions {
  /** Map a clip request to a URL. Default: the app's `/api/telemetry/<key>/clip`. */
  resolveUrl?: (meta: TelemetryClipMeta) => string
}

function defaultResolveUrl(meta: TelemetryClipMeta): string {
  const qs = new URLSearchParams()
  qs.set('drivers', meta.driverNumbers.join(','))
  qs.set('lapFrom', String(meta.lapFrom))
  qs.set('lapTo', String(meta.lapTo))
  if (meta.channels && meta.channels.length) qs.set('channels', meta.channels.join(','))
  if (meta.hz) qs.set('hz', String(meta.hz))
  return `/api/telemetry/${encodeURIComponent(meta.sessionKey)}/clip?${qs.toString()}`
}

/** Fetch-backed clip source (hits the app's Supabase clip route). */
export function createFetchClipSource(opts: FetchClipSourceOptions = {}): ClipDataSource {
  const resolveUrl = opts.resolveUrl ?? defaultResolveUrl
  return {
    async load(meta: TelemetryClipMeta): Promise<TelemetryClipPayload> {
      const url = resolveUrl(meta)
      const res = await fetch(url)
      if (res.status === 202) {
        throw new Error('Telemetry is still being processed for this session.')
      }
      if (!res.ok) {
        throw new Error(`Telemetry clip not available (${res.status}) at ${url}`)
      }
      return (await res.json()) as TelemetryClipPayload
    },
  }
}

/**
 * In-memory clip source backed by a payload already in hand (module sample /
 * story config). Resolves synchronously — no network — so a f1:telemetry-clip
 * layer renders in the catalog preview and at SSG time.
 */
export function createInlineClipSource(payload: TelemetryClipPayload): ClipDataSource {
  return {
    load(): Promise<TelemetryClipPayload> {
      return Promise.resolve(payload)
    },
  }
}
