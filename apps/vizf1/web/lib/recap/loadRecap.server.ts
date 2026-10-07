import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadRaceEvents } from '@/lib/raceEvents.server'
import {
  buildRecap,
  pickPass,
  type CornerRow,
  type LapChannels,
  type RecapInputs,
  type RecapLapRow,
  type RecapSessionRow,
} from './buildRecap'
import type { RaceRecap } from './types'

/** PostgREST caps a response at 1000 rows; a race is ~20 drivers × 50–78 laps. */
const PAGE = 1000

/**
 * Reads a race's telemetry (session, laps, events, circuit corners, then the
 * pass lap's channels) and builds its recap. Null when the session isn't
 * ingested.
 */
export async function loadRecap(db: SupabaseClient, sessionKey: string): Promise<RaceRecap | null> {
  const { data: sess, error } = await db
    .from('vizf1_telemetry_sessions')
    .select('session_key, season, round, gp_name, circuit_key, drivers, session_results')
    .eq('session_key', sessionKey)
    .maybeSingle()
  if (error) throw error
  if (!sess) return null
  const session = sess as RecapSessionRow & { circuit_key: string | null }

  const [laps, events, circuit] = await Promise.all([
    loadLaps(db, sessionKey),
    // Events add stop times and flag periods; the recap stands without them.
    loadRaceEvents(db, sessionKey).catch(() => null),
    session.circuit_key && session.season != null
      ? db
          .from('vizf1_telemetry_circuits')
          .select('corners')
          .eq('circuit_key', session.circuit_key)
          .eq('year', session.season)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const corners = ((circuit.data as { corners?: CornerRow[] } | null)?.corners ?? []).filter(
    (c) => Number.isFinite(c?.distance),
  )

  const inputs: RecapInputs = { session, laps, events, corners }
  const pass = pickPass(inputs)
  let channels: { a: LapChannels | null; b: LapChannels | null } | null = null
  if (pass) {
    const { data } = await db
      .from('vizf1_lap_telemetry')
      .select('driver_number, channels')
      .eq('session_key', sessionKey)
      .eq('lap', pass.lap)
      .in('driver_number', [pass.a, pass.b])
    const rows = (data ?? []) as { driver_number: number; channels: LapChannels | null }[]
    const of = (dn: number) => rows.find((r) => r.driver_number === dn)?.channels ?? null
    channels = { a: of(pass.a), b: of(pass.b) }
  }
  return buildRecap(inputs, pass, channels)
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
