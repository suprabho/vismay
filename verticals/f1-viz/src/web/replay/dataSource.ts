/**
 * Replay data-source seam.
 *
 * The render layer depends ONLY on `ReplayDataSource` — never on where the data
 * comes from. v1 ships a fixture-backed source (static JSON in /public). A real
 * OpenF1→Supabase ingest later implements the same interface and drops in with
 * zero component changes.
 */
import type {
  CarPositionTrack,
  CircuitGeometry,
  LapTelemetryAggregate,
  ReplaySessionData,
  SectorBests,
  SessionDetail,
} from './types'

/** On-disk fixture shape: Maps flattened to arrays so it serializes to JSON. */
export interface ReplayFixture {
  session: SessionDetail
  circuit: CircuitGeometry | null
  tracks: CarPositionTrack[]
  aggregates: LapTelemetryAggregate[]
  sectorBests: SectorBests | null
}

export interface ReplayDataSource {
  /** Resolve a session reference (e.g. a round or session key) to replay data. */
  load(sessionRef: string): Promise<ReplaySessionData>
}

/** Rehydrate the wire/disk fixture into the Map-shaped runtime payload. */
export function hydrateFixture(fixture: ReplayFixture): ReplaySessionData {
  const tracks = new Map<number, CarPositionTrack>()
  for (const t of fixture.tracks) tracks.set(t.driverNumber, t)

  const aggregates = new Map<number, Map<number, LapTelemetryAggregate>>()
  for (const agg of fixture.aggregates) {
    let perDriver = aggregates.get(agg.driverNumber)
    if (!perDriver) {
      perDriver = new Map()
      aggregates.set(agg.driverNumber, perDriver)
    }
    perDriver.set(agg.lap, agg)
  }

  return {
    session: fixture.session,
    circuit: fixture.circuit,
    tracks,
    aggregates,
    sectorBests: fixture.sectorBests,
  }
}

export interface FixtureSourceOptions {
  /** Maps a session reference to a JSON URL. Default: `/fixtures/replay-<ref>.json`. */
  resolveUrl?: (sessionRef: string) => string
  /**
   * If the requested reference 404s, retry with this reference. Lets every round
   * fall back to a shared demo fixture until real per-session data exists.
   */
  fallbackRef?: string
}

/** Fixture-backed data source. */
export function createFixtureDataSource(opts: FixtureSourceOptions = {}): ReplayDataSource {
  const resolveUrl = opts.resolveUrl ?? ((ref: string) => `/fixtures/replay-${ref}.json`)

  async function fetchFixture(ref: string): Promise<ReplayFixture> {
    const url = resolveUrl(ref)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Replay fixture not found (${res.status}) at ${url}`)
    return (await res.json()) as ReplayFixture
  }

  return {
    async load(sessionRef: string): Promise<ReplaySessionData> {
      try {
        return hydrateFixture(await fetchFixture(sessionRef))
      } catch (err) {
        if (opts.fallbackRef && opts.fallbackRef !== sessionRef) {
          return hydrateFixture(await fetchFixture(opts.fallbackRef))
        }
        throw err
      }
    },
  }
}

/**
 * In-memory data source backed by a fixture already in hand (e.g. inlined in a
 * story's YAML / a module sample). Resolves synchronously — no network — so a
 * `f1:race-replay` layer renders in the catalog preview and at SSG time with
 * zero dependency on a `/public` fixture file.
 */
export function createInlineDataSource(fixture: ReplayFixture): ReplayDataSource {
  return {
    load(): Promise<ReplaySessionData> {
      return Promise.resolve(hydrateFixture(fixture))
    },
  }
}

export type { CircuitGeometry }
