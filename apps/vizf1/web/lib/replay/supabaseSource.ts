/**
 * Supabase-backed replay assembler.
 *
 * Implements the `ReplayDataSource` seam against the real telemetry tables
 * (vizf1_telemetry_sessions / _circuits / _laps / vizf1_car_positions) written
 * by the FastF1 ingestion worker. `assembleReplayFixture` returns the
 * `ReplayFixture` wire shape (the inverse of `hydrateFixture`) so the
 * `/api/replay/[ref]` route can serialize it and the existing fixture-fetch
 * client path stays unchanged. `createSupabaseDataSource` wraps it for direct
 * (browser/server) use.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hydrateFixture, type ReplayDataSource, type ReplayFixture } from './dataSource'
import type {
  CarPositionTrack,
  CircuitGeometry,
  DriverSectorBest,
  LapTelemetryAggregate,
  RaceDriver,
  ReplaySessionData,
  SectorBests,
  SessionDetail,
} from './types'

export interface AssembleOptions {
  /** Season used when a bare round number is given (defaults to current year). */
  seasonHint?: number
}

const SESSION_KEY_RE = /^\d{4}_/
const YEAR_ROUND_RE = /^(\d{4})-(\d+)$/

/** Resolve a replay ref (session_key | "<year>-<round>" | round) to a session_key. */
async function resolveSessionKey(
  client: SupabaseClient,
  ref: string,
  seasonHint?: number,
): Promise<string | null> {
  if (SESSION_KEY_RE.test(ref)) return ref

  let season: number | null = null
  let round: number | null = null
  const ym = YEAR_ROUND_RE.exec(ref)
  if (ym) {
    season = Number(ym[1])
    round = Number(ym[2])
  } else if (/^\d+$/.test(ref)) {
    round = Number(ref)
    season = seasonHint ?? null
  }
  if (round == null) return null

  let q = client
    .from('vizf1_telemetry_sessions')
    .select('session_key, season')
    .eq('round', round)
    .eq('session_type', 'R')
  if (season != null) q = q.eq('season', season)
  const { data } = await q.order('season', { ascending: false }).limit(1)
  return data && data.length ? (data[0] as { session_key: string }).session_key : null
}

interface DriverJson {
  driverNumber: number
  fullName?: string
  abbreviation?: string
  teamName?: string
  teamId?: string
  teamColour?: string
  championshipPosition?: number | null
  championshipPoints?: number | null
  championshipWins?: number | null
}

function mapDrivers(raw: unknown): RaceDriver[] {
  if (!Array.isArray(raw)) return []
  return (raw as DriverJson[]).map((d) => ({
    driverNumber: d.driverNumber,
    fullName: d.fullName ?? '',
    abbreviation: d.abbreviation ?? '',
    teamName: d.teamName ?? '',
    teamId: d.teamId,
    teamColour: d.teamColour ?? '#ffffff',
    championshipPosition: d.championshipPosition ?? null,
    championshipPoints: d.championshipPoints ?? null,
    championshipWins: d.championshipWins ?? null,
  }))
}

interface LapRow {
  driver_number: number
  lap: number
  sectors: Array<number | null> | null
  avg_speed: number | null
  min_gap_to_ahead_m: number | null
}

function computeSectorBests(sessionKey: string, laps: LapRow[]): SectorBests {
  const driverBests: Record<number, DriverSectorBest> = {}
  const best: Record<number, { s1: number; s2: number; s3: number; s1Lap: number; s2Lap: number; s3Lap: number }> = {}
  const purple: SectorBests['sessionPurple'] = { s1: null, s2: null, s3: null }
  const purpleKeys = ['s1', 's2', 's3'] as const

  for (const l of laps) {
    const dn = l.driver_number
    if (!best[dn]) best[dn] = { s1: Infinity, s2: Infinity, s3: Infinity, s1Lap: 0, s2Lap: 0, s3Lap: 0 }
    const sectors = l.sectors ?? []
    for (let i = 0; i < 3; i++) {
      const t = sectors[i] ?? 0
      if (!t || t <= 0) continue
      const key = purpleKeys[i]
      if (t < best[dn][key]) {
        best[dn][key] = t
        best[dn][`${key}Lap` as 's1Lap' | 's2Lap' | 's3Lap'] = l.lap
      }
      const p = purple[key]
      if (!p || t < p.time) purple[key] = { time: t, driverNumber: dn, lap: l.lap }
    }
  }

  for (const [dn, b] of Object.entries(best)) {
    driverBests[Number(dn)] = {
      s1: Number.isFinite(b.s1) ? b.s1 : 0,
      s2: Number.isFinite(b.s2) ? b.s2 : 0,
      s3: Number.isFinite(b.s3) ? b.s3 : 0,
      s1Lap: b.s1Lap,
      s2Lap: b.s2Lap,
      s3Lap: b.s3Lap,
    }
  }
  return { sessionKey, driverBests, sessionPurple: purple }
}

/** Build the `ReplayFixture` wire shape from Supabase, or null if not ingested. */
export async function assembleReplayFixture(
  client: SupabaseClient,
  ref: string,
  opts: AssembleOptions = {},
): Promise<ReplayFixture | null> {
  const sessionKey = await resolveSessionKey(client, ref, opts.seasonHint)
  if (!sessionKey) return null

  const { data: sess } = await client
    .from('vizf1_telemetry_sessions')
    .select('session_key, circuit_key, season, session_name, circuit_name, country, drivers')
    .eq('session_key', sessionKey)
    .maybeSingle()
  if (!sess) return null
  const s = sess as {
    session_key: string
    circuit_key: string
    season: number
    session_name: string | null
    circuit_name: string | null
    country: string | null
    drivers: unknown
  }

  const [{ data: circ }, { data: posRows }, { data: lapRows }] = await Promise.all([
    client
      .from('vizf1_telemetry_circuits')
      .select('*')
      .eq('circuit_key', s.circuit_key)
      .eq('year', s.season)
      .maybeSingle(),
    client.from('vizf1_car_positions').select('*').eq('session_key', sessionKey),
    client
      .from('vizf1_telemetry_laps')
      .select('driver_number, lap, sectors, avg_speed, min_gap_to_ahead_m')
      .eq('session_key', sessionKey),
  ])

  const session: SessionDetail = {
    sessionKey: s.session_key,
    sessionName: s.session_name ?? '',
    circuitName: s.circuit_name ?? '',
    country: s.country ?? '',
    year: s.season,
    circuitKey: s.circuit_key,
    drivers: mapDrivers(s.drivers),
  }

  const circuit: CircuitGeometry | null = circ
    ? {
        circuitKey: (circ as Record<string, unknown>).circuit_key as string,
        year: (circ as Record<string, unknown>).year as number,
        gpName: ((circ as Record<string, unknown>).gp_name as string) ?? '',
        circuitName: ((circ as Record<string, unknown>).circuit_name as string) ?? '',
        country: ((circ as Record<string, unknown>).country as string) ?? '',
        rotationDeg: ((circ as Record<string, unknown>).rotation_deg as number) ?? 0,
        corners: ((circ as Record<string, unknown>).corners as CircuitGeometry['corners']) ?? [],
        outline: ((circ as Record<string, unknown>).outline as CircuitGeometry['outline']) ?? { x: [], y: [] },
        bounds: ((circ as Record<string, unknown>).bounds as CircuitGeometry['bounds']) ?? null,
        sectorBoundaries:
          ((circ as Record<string, unknown>).sector_boundaries as CircuitGeometry['sectorBoundaries']) ?? null,
      }
    : null

  const tracks: CarPositionTrack[] = (posRows ?? []).map((p) => {
    const row = p as Record<string, unknown>
    return {
      sessionKey: row.session_key as string,
      circuitKey: (row.circuit_key as string) ?? s.circuit_key,
      driverNumber: row.driver_number as number,
      sampleRateHz: (row.sample_rate_hz as number) ?? 4,
      frameCount: (row.frame_count as number) ?? 0,
      t0Ms: (row.t0_ms as number) ?? 0,
      tEndMs: (row.t_end_ms as number) ?? 0,
      frames: row.frames as CarPositionTrack['frames'],
    }
  })

  const laps = (lapRows ?? []) as LapRow[]
  const aggregates: LapTelemetryAggregate[] = laps.map((l) => ({
    driverNumber: l.driver_number,
    lap: l.lap,
    avgSpeed: l.avg_speed ?? 0,
    minGapToAheadM: l.min_gap_to_ahead_m ?? 0,
  }))

  const sectorBests = computeSectorBests(sessionKey, laps)

  return { session, circuit, tracks, aggregates, sectorBests }
}

/** ReplayDataSource backed directly by Supabase (browser or server client). */
export function createSupabaseDataSource(
  client: SupabaseClient,
  opts: AssembleOptions = {},
): ReplayDataSource {
  return {
    async load(ref: string): Promise<ReplaySessionData> {
      const fixture = await assembleReplayFixture(client, ref, opts)
      if (!fixture) throw new Error(`No telemetry ingested for replay ref "${ref}"`)
      return hydrateFixture(fixture)
    },
  }
}
