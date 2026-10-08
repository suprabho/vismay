/**
 * Reading a race's recap rows from the vizf1 telemetry tables. Server-side
 * (any Supabase client that can read them): vizf1's /api/recap route and the
 * recap brief's replay moments share it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildRecap,
  locatePass,
  rankPasses,
  indexRace,
  type CornerRow,
  type LapChannels,
  type PassPick,
  type RecapInputs,
  type RecapLapRow,
  type RecapSessionRow,
} from './buildRecap'
import { findMoments, passKey, type LocatedPass, type ReplayMoment } from './moments'
import type { RaceRecap } from './types'

/** PostgREST caps a response at 1000 rows; a race is ~20 drivers × 50–78 laps. */
const PAGE = 1000

export interface RecapRows extends RecapInputs {
  session: RecapSessionRow & { circuit_key: string | null; session_type?: string | null }
}

/**
 * The session, its laps and its circuit's corners. `events` (pit stops and
 * flag periods) is optional: without it, periods come from the laps' safety
 * car flags and the pit-swing tiles go without stop times. Null when the
 * session isn't ingested.
 */
export async function loadRecapInputs(
  db: SupabaseClient,
  sessionKey: string,
  events?: () => Promise<RecapInputs['events']>,
): Promise<RecapRows | null> {
  const { data: sess, error } = await db
    .from('vizf1_telemetry_sessions')
    .select('session_key, season, round, gp_name, circuit_key, session_type, drivers, session_results')
    .eq('session_key', sessionKey)
    .maybeSingle()
  if (error) throw error
  if (!sess) return null
  const session = sess as RecapRows['session']

  const [laps, ev, circuit] = await Promise.all([
    loadLaps(db, sessionKey),
    // Events add stop times and flag periods; the recap stands without them.
    events ? events().catch(() => null) : Promise.resolve(null),
    session.circuit_key && session.season != null
      ? db
          .from('vizf1_telemetry_circuits')
          .select('corners')
          .eq('circuit_key', session.circuit_key)
          .eq('year', session.season)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const corners = ((circuit.data as { corners?: CornerRow[] } | null)?.corners ?? []).filter((c) =>
    Number.isFinite(c?.distance),
  )
  return { session, laps, events: ev, corners }
}

/** Both cars' telemetry on a pass's lap. */
export async function loadPassChannels(
  db: SupabaseClient,
  sessionKey: string,
  pass: PassPick,
): Promise<{ a: LapChannels | null; b: LapChannels | null }> {
  const { data } = await db
    .from('vizf1_lap_telemetry')
    .select('driver_number, channels')
    .eq('session_key', sessionKey)
    .eq('lap', pass.lap)
    .in('driver_number', [pass.a, pass.b])
  const rows = (data ?? []) as { driver_number: number; channels: LapChannels | null }[]
  const of = (dn: number) => rows.find((r) => r.driver_number === dn)?.channels ?? null
  return { a: of(pass.a), b: of(pass.b) }
}

/** The race's recap: its rows, then the best pass's lap of telemetry. */
export async function loadRecap(
  db: SupabaseClient,
  sessionKey: string,
  events?: () => Promise<RecapInputs['events']>,
): Promise<RaceRecap | null> {
  const inputs = await loadRecapInputs(db, sessionKey, events)
  if (!inputs) return null
  const pass = rankPasses(indexRace(inputs), 1)[0] ?? null
  const channels = pass ? await loadPassChannels(db, sessionKey, pass) : null
  return buildRecap(inputs, pass, channels)
}

/** How many of the top passes get located to the second (one telemetry read each). */
const LOCATE_PASSES = 3

/** The race's replay moments, with its top passes pinned to the second. Null when not ingested. */
export async function loadReplayMoments(
  db: SupabaseClient,
  sessionKey: string,
  events?: () => Promise<RecapInputs['events']>,
): Promise<{ sessionKey: string; title: string; laps: number; moments: ReplayMoment[] } | null> {
  const inputs = await loadRecapInputs(db, sessionKey, events)
  if (!inputs) return null
  const race = indexRace(inputs)
  const located = new Map<string, LocatedPass>()
  await Promise.all(
    rankPasses(race, LOCATE_PASSES).map(async (p) => {
      const loc = locatePass(await loadPassChannels(db, sessionKey, p), inputs.corners)
      if (loc) located.set(passKey(p), { at: loc.at, corner: loc.corner })
    }),
  )
  const s = inputs.session
  return {
    sessionKey,
    title: `${s.season ?? ''} ${s.gp_name ?? 'Grand Prix'}`.trim(),
    laps: race.totalLaps,
    moments: findMoments(inputs, located),
  }
}

async function loadLaps(db: SupabaseClient, sessionKey: string): Promise<RecapLapRow[]> {
  const out: RecapLapRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('vizf1_telemetry_laps')
      .select('driver_number, lap, lap_time_sec, position, events')
      .eq('session_key', sessionKey)
      .order('driver_number')
      .order('lap')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as RecapLapRow[]))
    if (!data || data.length < PAGE) return out
  }
}
