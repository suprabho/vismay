/**
 * VizF1 race-weekend ingest.
 *
 * Pulls the current season from OpenF1:
 *   /meetings        → races
 *   /sessions        → sessions (FP1, FP2, FP3, Quali, Sprint Q, Sprint, Race)
 *   /drivers         → drivers (headshot, team_colour, country)
 *   /laps + /position → session_results (best lap, position, gap)
 *
 * Idempotent — every upsert is keyed on natural IDs so re-runs are no-ops.
 *
 * Run via: `pnpm --filter @vizf1/worker ingest:sessions`
 * In CI:   .github/workflows/vizf1-race-weekend.yml (every 6h Fri/Sat/Sun)
 */

import { getSupabase } from './supabase'
import {
  listMeetings,
  listSessions,
  listDrivers,
  listLaps,
  listPositions,
  aggregateLapsByDriver,
  normaliseSessionName,
  type OpenF1Meeting,
  type OpenF1Session,
  type OpenF1Driver,
} from './openf1'

type SupabaseClient = ReturnType<typeof getSupabase>

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function looksFinished(s: OpenF1Session): boolean {
  return new Date(s.date_end).getTime() < Date.now()
}

async function upsertCircuit(sb: SupabaseClient, m: OpenF1Meeting) {
  const circuitId = slug(m.circuit_short_name || m.meeting_name)
  await sb
    .from('circuits')
    .upsert(
      {
        circuit_id: circuitId,
        name: m.circuit_short_name || m.meeting_name,
        locality: m.location,
        country: m.country_name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'circuit_id' },
    )
  return circuitId
}

async function upsertRace(
  sb: SupabaseClient,
  m: OpenF1Meeting,
  circuitId: string,
  round: number,
  sessions: OpenF1Session[],
): Promise<string> {
  const date = m.date_start.slice(0, 10)
  const raceSession = sessions.find((s) => normaliseSessionName(s.session_name) === 'race')
  const hasSprint = sessions.some((s) => normaliseSessionName(s.session_name) === 'sprint')
  const { data, error } = await sb
    .from('races')
    .upsert(
      {
        season: String(m.year),
        round,
        race_name: m.meeting_name,
        circuit_id: circuitId,
        date,
        time: raceSession?.date_start.slice(11, 19) ?? null,
        has_sprint: hasSprint,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'season,round' },
    )
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`upsertRace failed for ${m.meeting_name}: ${error?.message}`)
  }
  return data.id as string
}

async function upsertDrivers(sb: SupabaseClient, drivers: OpenF1Driver[]) {
  if (drivers.length === 0) return
  // Dedupe by name_acronym → driver_id slug.
  const byId = new Map<string, OpenF1Driver>()
  for (const d of drivers) {
    const id = slug(`${d.first_name}_${d.last_name}`)
    if (!byId.has(id)) byId.set(id, d)
  }
  const rows = Array.from(byId.entries()).map(([driver_id, d]) => ({
    driver_id,
    given_name: d.first_name,
    family_name: d.last_name,
    code: d.name_acronym,
    permanent_number: String(d.driver_number),
    nationality: d.country_code,
    headshot_url: d.headshot_url,
    constructor_id: slug(d.team_name),
    primary_color: d.team_colour ? `#${d.team_colour}` : null,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('drivers').upsert(rows, { onConflict: 'driver_id' })
  if (error) console.error('[ingest:sessions] drivers upsert failed:', error)

  // And constructors (derived from team_name + team_colour)
  const constructors = new Map<string, { name: string; color: string | null }>()
  for (const d of drivers) {
    const id = slug(d.team_name)
    if (!constructors.has(id)) {
      constructors.set(id, {
        name: d.team_name,
        color: d.team_colour ? `#${d.team_colour}` : null,
      })
    }
  }
  const constructorRows = Array.from(constructors.entries()).map(([constructor_id, c]) => ({
    constructor_id,
    name: c.name,
    primary_color: c.color,
    logo_slug: constructor_id,
    updated_at: new Date().toISOString(),
  }))
  await sb.from('constructors').upsert(constructorRows, { onConflict: 'constructor_id' })
}

async function ingestSession(sb: SupabaseClient, raceId: string, openf1Session: OpenF1Session) {
  const sessionType = normaliseSessionName(openf1Session.session_name)
  if (!sessionType) return

  const status = looksFinished(openf1Session) ? 'finished' : 'pending'

  const { data: row, error: sErr } = await sb
    .from('sessions')
    .upsert(
      {
        race_id: raceId,
        session_type: sessionType,
        session_key_openf1: openf1Session.session_key,
        started_at: openf1Session.date_start,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'race_id,session_type' },
    )
    .select('id')
    .single()
  if (sErr || !row) {
    console.error(`[session] upsert failed (${sessionType}):`, sErr)
    return
  }
  const sessionId = row.id as string

  if (status !== 'finished') return

  // For finished sessions, pull laps + final position, then upsert results.
  const [laps, positions, drivers] = await Promise.all([
    listLaps(openf1Session.session_key),
    listPositions(openf1Session.session_key),
    listDrivers(openf1Session.session_key),
  ])

  await upsertDrivers(sb, drivers)

  const lapsByDriver = aggregateLapsByDriver(laps)
  // Final position per driver = the latest position event chronologically.
  const finalPos = new Map<number, number>()
  for (const p of positions) finalPos.set(p.driver_number, p.position)

  const driverNumberToId = new Map<number, string>()
  for (const d of drivers) driverNumberToId.set(d.driver_number, slug(`${d.first_name}_${d.last_name}`))

  // Reference best lap to compute gap_to_leader_ms
  const bestLaps = Array.from(lapsByDriver.values())
    .map((v) => v.bestLapMs)
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b)
  const leaderBest = bestLaps[0] ?? null

  const results = Array.from(driverNumberToId.entries()).map(([num, driver_id]) => {
    const lapAgg = lapsByDriver.get(num) ?? { bestLapMs: null, lapsCompleted: 0 }
    const position = finalPos.get(num) ?? null
    const gap =
      leaderBest != null && lapAgg.bestLapMs != null && lapAgg.bestLapMs !== leaderBest
        ? lapAgg.bestLapMs - leaderBest
        : 0
    return {
      session_id: sessionId,
      driver_id,
      position,
      best_lap_ms: lapAgg.bestLapMs,
      laps_completed: lapAgg.lapsCompleted,
      gap_to_leader_ms: gap || null,
    }
  })

  if (results.length === 0) return
  const { error: rErr } = await sb
    .from('session_results')
    .upsert(results, { onConflict: 'session_id,driver_id' })
  if (rErr) console.error(`[session_results] upsert failed (${sessionType}):`, rErr)
}

export async function runIngestSessions(year?: number) {
  const sb = getSupabase()
  const yr = year ?? new Date().getFullYear()
  console.log(`[ingest:sessions] year=${yr} start ${new Date().toISOString()}`)

  const meetings = await listMeetings(yr)
  meetings.sort((a, b) => a.date_start.localeCompare(b.date_start))

  let i = 0
  for (const m of meetings) {
    i += 1
    try {
      const circuitId = await upsertCircuit(sb, m)
      const sessions = await listSessions(m.meeting_key)
      const raceId = await upsertRace(sb, m, circuitId, i, sessions)
      for (const s of sessions) {
        await ingestSession(sb, raceId, s)
      }
      console.log(`[meeting ${i}] ${m.meeting_name} — ${sessions.length} sessions`)
    } catch (e) {
      console.error(`[meeting ${i}] failed for ${m.meeting_name}:`, e)
    }
  }
  console.log(`[ingest:sessions] done — ${meetings.length} meetings`)
}

if (require.main === module) {
  runIngestSessions()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
