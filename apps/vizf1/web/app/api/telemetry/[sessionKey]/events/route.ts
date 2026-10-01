import { NextResponse } from 'next/server'
import type { RaceEvents } from '@vismay/f1-viz/web'
import { supabaseServer } from '@/lib/supabaseServer'
import {
  parsePits,
  parseRaceControl,
  periodsFromScLaps,
  pitsFromTiming,
  type PitRow,
  type RaceControlRow,
  type StintJson,
} from '@/lib/raceControl'

/**
 * GET /api/telemetry/<sessionKey>/events
 *
 * Lap-keyed race events for the Telemetry tab: safety car / VSC / red / yellow
 * flag periods and pit stops (lane + stationary time). Sourced from OpenF1's
 * race-control and pit feeds (historical data is free, unauthenticated); when
 * OpenF1 can't be matched or reached, falls back to what the ingest stored —
 * the `sc_deployed` / `pit_in` lap flags and the stints' pit deltas.
 */
export const dynamic = 'force-dynamic'

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }
const OPENF1 = 'https://api.openf1.org/v1'
/** Finished sessions don't change; an hour keeps a just-finished race fresh enough. */
const REVALIDATE_SEC = 3600

interface OpenF1Session {
  session_key: number
  session_name?: string
  date_start?: string
  country_name?: string
  location?: string
}

async function openf1<T>(path: string): Promise<T[]> {
  const res = await fetch(`${OPENF1}${path}`, {
    headers: { 'User-Agent': 'VizF1/1.0 (+https://vizf1.app)' },
    next: { revalidate: REVALIDATE_SEC },
    signal: AbortSignal.timeout(8000),
  })
  // OpenF1 answers 404 (not []) when an endpoint has no rows for a session.
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`OpenF1 ${res.status} ${path}`)
  const body = (await res.json()) as unknown
  return Array.isArray(body) ? (body as T[]) : []
}

/** Find the OpenF1 session for a telemetry row: same year + session name, nearest start. */
async function matchOpenF1Session(row: {
  season: number
  session_type: string
  date_start: string | null
  country: string | null
  circuit_name: string | null
}): Promise<number | null> {
  const name = row.session_type === 'S' ? 'Sprint' : row.session_type === 'R' ? 'Race' : null
  if (!name) return null
  const sessions = await openf1<OpenF1Session>(`/sessions?year=${row.season}&session_name=${name}`)
  if (row.date_start) {
    const want = Date.parse(row.date_start)
    let best: OpenF1Session | null = null
    let bestGap = Infinity
    for (const s of sessions) {
      const gap = Math.abs(Date.parse(s.date_start ?? '') - want)
      if (gap < bestGap) {
        bestGap = gap
        best = s
      }
    }
    // FastF1 and OpenF1 start times agree to the minute; 12h tolerates a TZ slip.
    if (best && bestGap < 12 * 3600_000) return best.session_key
  }
  const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim()
  const byPlace =
    sessions.find((s) => row.circuit_name && norm(s.location) === norm(row.circuit_name)) ??
    sessions.find((s) => row.country && norm(s.country_name) === norm(row.country))
  return byPlace?.session_key ?? null
}

export async function GET(_req: Request, ctx: { params: Promise<{ sessionKey: string }> }) {
  const { sessionKey } = await ctx.params
  const db = supabaseServer()

  const { data: sess } = await db
    .from('vizf1_telemetry_sessions')
    .select('season, session_type, date_start, country, circuit_name, stints')
    .eq('session_key', sessionKey)
    .maybeSingle()
  if (!sess) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404, headers: CORS_HEADERS })
  }
  const row = sess as {
    season: number
    session_type: string
    date_start: string | null
    country: string | null
    circuit_name: string | null
    stints: StintJson[] | null
  }

  let events: RaceEvents | null = null
  try {
    const key = await matchOpenF1Session(row)
    if (key != null) {
      const rc = await openf1<RaceControlRow>(`/race_control?session_key=${key}`)
      const pits = await openf1<PitRow>(`/pit?session_key=${key}`)
      if (rc.length > 0) events = { source: 'openf1', periods: parseRaceControl(rc), pitStops: parsePits(pits) }
    }
  } catch {
    // Unreachable / rate-limited OpenF1 — fall through to the ingested flags.
  }

  if (!events || events.pitStops.length === 0) {
    const [{ data: scRows }, { data: pitRows }] = await Promise.all([
      db.from('vizf1_telemetry_laps').select('lap').eq('session_key', sessionKey).contains('events', ['sc_deployed']),
      db
        .from('vizf1_telemetry_laps')
        .select('driver_number, lap')
        .eq('session_key', sessionKey)
        .contains('events', ['pit_in']),
    ])
    const pitStops = pitsFromTiming(
      ((pitRows ?? []) as Array<{ driver_number: number; lap: number }>).map((p) => ({
        driverNumber: p.driver_number,
        lap: p.lap,
      })),
      Array.isArray(row.stints) ? row.stints : [],
    )
    events = events
      ? { ...events, pitStops }
      : {
          source: 'timing',
          periods: periodsFromScLaps(((scRows ?? []) as Array<{ lap: number }>).map((r) => r.lap)),
          pitStops,
        }
  }

  return NextResponse.json(events, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600', ...CORS_HEADERS },
  })
}
