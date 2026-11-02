/**
 * VizF1 race-weekend ingest.
 *
 * Pulls the current season from OpenF1:
 *   /meetings        → races
 *   /sessions        → sessions (FP1, FP2, FP3, Quali, Sprint Q, Sprint, Race)
 *   /drivers         → drivers (headshot, team_colour, country)
 *   /laps + /position → session_results (best lap, position, gap)
 *   /session_result  → official position, points and status for race + sprint
 *
 * Idempotent — every upsert is keyed on natural IDs so re-runs are no-ops.
 *
 * Run via: `pnpm --filter @vizf1/worker ingest:sessions`
 * In CI:   .github/workflows/vizf1-race-weekend.yml (every 6h Fri/Sat/Sun)
 */

import { F1_BRAND } from '@vizf1/brand'
import { getSupabase } from './supabase'
import {
  listMeetings,
  listSessions,
  listDrivers,
  listLaps,
  listPositions,
  listSessionResults,
  aggregateLapsByDriver,
  normaliseSessionName,
  type OpenF1Meeting,
  type OpenF1Session,
  type OpenF1Driver,
  type OpenF1SessionResult,
} from './openf1'

type SupabaseClient = ReturnType<typeof getSupabase>
type NamedDriver = OpenF1Driver & { first_name: string; last_name: string }

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

// A session this far past its scheduled end with zero laps AND zero position
// events never ran (the 2026 Bahrain/Saudi weekends were canceled but OpenF1
// keeps their schedule entries + pre-seeded entry lists). Well beyond any
// publication lag — real session data lands within hours.
const CANCELED_GRACE_MS = 48 * 60 * 60 * 1000

function looksCanceled(s: OpenF1Session): boolean {
  return new Date(s.date_end).getTime() < Date.now() - CANCELED_GRACE_MS
}

// OpenF1 sometimes ships a stub for a stand-in driver: number and full_name
// only, with name and team null (#50 Hirakawa in the 2026 Mexico City race,
// though his qualifying row that weekend was complete). Fill the gaps from the
// weekend's earlier sessions so the driver keeps their result.
function resolveDrivers(drivers: OpenF1Driver[], roster: Map<number, OpenF1Driver>): NamedDriver[] {
  const resolved: NamedDriver[] = []
  for (const d of drivers) {
    const known = roster.get(d.driver_number)
    const [firstFromFull, ...restOfFull] = (d.full_name ?? '').trim().split(/\s+/)
    const first_name = d.first_name ?? known?.first_name ?? firstFromFull
    const last_name = d.last_name ?? known?.last_name ?? restOfFull.join(' ')
    if (!first_name || !last_name) {
      console.warn(`[drivers] skipped #${d.driver_number} in session ${d.session_key}: no name`)
      continue
    }
    const driver = {
      ...d,
      first_name,
      last_name,
      team_name: d.team_name ?? known?.team_name ?? null,
      team_colour: d.team_colour ?? known?.team_colour ?? null,
      headshot_url: d.headshot_url ?? known?.headshot_url ?? null,
    }
    if (driver.team_name) roster.set(d.driver_number, driver)
    resolved.push(driver)
  }
  return resolved
}

// Same wording as the telemetry ingest's _build_results (openf1_ingest.py).
function officialStatus(r: OpenF1SessionResult): string {
  if (r.dsq) return 'Disqualified'
  if (r.dns) return 'Did not start'
  if (r.dnf) return 'DNF'
  if (typeof r.gap_to_leader === 'string') return r.gap_to_leader
  return r.position == null ? 'Not classified' : 'Finished'
}

async function upsertCircuit(sb: SupabaseClient, m: OpenF1Meeting) {
  const circuitId = slug(m.circuit_short_name || m.meeting_name)
  await sb
    .from('vizf1_circuits')
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
    .from('vizf1_races')
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

async function upsertDrivers(sb: SupabaseClient, drivers: NamedDriver[]) {
  if (drivers.length === 0) return

  // Constructors first — vizf1_drivers.constructor_id has a FK referencing
  // vizf1_constructors(constructor_id) (added in 002_drivers_constructor_fk.sql),
  // so the parent rows must exist before drivers upsert.
  const constructors = new Map<string, { name: string; color: string | null }>()
  for (const d of drivers) {
    if (!d.team_name) continue
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
    logo_url: F1_BRAND.constructorLogos[constructor_id] ?? null,
    updated_at: new Date().toISOString(),
  }))
  const { error: cErr } = await sb
    .from('vizf1_constructors')
    .upsert(constructorRows, { onConflict: 'constructor_id' })
  if (cErr) console.error('[ingest:sessions] constructors upsert failed:', cErr)

  // Dedupe drivers by slug, then upsert.
  const byId = new Map<string, NamedDriver>()
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
    constructor_id: d.team_name ? slug(d.team_name) : null,
    primary_color: d.team_colour ? `#${d.team_colour}` : null,
    updated_at: new Date().toISOString(),
  }))
  const withTeam = rows.filter((r) => r.constructor_id)
  const teamless = rows.filter((r) => !r.constructor_id)
  if (withTeam.length > 0) {
    const { error } = await sb.from('vizf1_drivers').upsert(withTeam, { onConflict: 'driver_id' })
    if (error) console.error('[ingest:sessions] drivers upsert failed:', error)
  }
  // No team known yet: create the row so results can reference the driver, but
  // never blank the team on one that already exists.
  if (teamless.length > 0) {
    const { error } = await sb
      .from('vizf1_drivers')
      .upsert(teamless, { onConflict: 'driver_id', ignoreDuplicates: true })
    if (error) console.error('[ingest:sessions] teamless drivers upsert failed:', error)
  }
}

async function ingestSession(
  sb: SupabaseClient,
  raceId: string,
  openf1Session: OpenF1Session,
  roster: Map<number, OpenF1Driver>,
) {
  const sessionType = normaliseSessionName(openf1Session.session_name)
  if (!sessionType) return

  const status = looksFinished(openf1Session) ? 'finished' : 'pending'

  const { data: row, error: sErr } = await sb
    .from('vizf1_sessions')
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
  const isClassified = sessionType === 'race' || sessionType === 'sprint'
  const [laps, positions, rawDrivers, sessionResults] = await Promise.all([
    listLaps(openf1Session.session_key),
    listPositions(openf1Session.session_key),
    listDrivers(openf1Session.session_key),
    isClassified ? listSessionResults(openf1Session.session_key) : [],
  ])
  const drivers = resolveDrivers(rawDrivers, roster)

  // No timing data at all — don't fabricate results off the pre-seeded entry
  // list (that used to leave all-NULL husk rows for the canceled 2026
  // Bahrain/Saudi weekends). Recently-ended sessions stay 'finished' and get
  // their results on a later run once OpenF1 publishes; sessions long past
  // with nothing are marked canceled so the UI can say so honestly.
  if (laps.length === 0 && positions.length === 0) {
    if (looksCanceled(openf1Session)) {
      const { error } = await sb
        .from('vizf1_sessions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (error) console.error(`[session] cancel mark failed (${sessionType}):`, error)
      else console.log(`[session] marked canceled (${sessionType}, no data)`)
    }
    return
  }

  await upsertDrivers(sb, drivers)

  const lapsByDriver = aggregateLapsByDriver(laps)
  // Final position per driver = the latest position event chronologically.
  const finalPos = new Map<number, number>()
  for (const p of positions) finalPos.set(p.driver_number, p.position)

  // Race + sprint: the official classification wins over the last on-track
  // position, which misses post-race penalties and numbers retirements. It can
  // land after the timing data, so until then fall back to on-track order.
  const official = new Map(sessionResults.map((r) => [r.driver_number, r]))

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
    const result = official.get(num)
    const position = official.size > 0 ? (result?.position ?? null) : (finalPos.get(num) ?? null)
    const bestLapGap =
      leaderBest != null && lapAgg.bestLapMs != null && lapAgg.bestLapMs !== leaderBest
        ? lapAgg.bestLapMs - leaderBest
        : 0
    const officialGap =
      typeof result?.gap_to_leader === 'number' ? Math.round(result.gap_to_leader * 1000) : 0
    const gap = official.size > 0 ? officialGap : bestLapGap
    return {
      session_id: sessionId,
      driver_id,
      position,
      best_lap_ms: lapAgg.bestLapMs,
      laps_completed: result?.number_of_laps ?? lapAgg.lapsCompleted,
      gap_to_leader_ms: gap || null,
      points: result?.points ?? null,
      status: result ? officialStatus(result) : null,
    }
  })

  if (results.length === 0) return
  const { error: rErr } = await sb
    .from('vizf1_session_results')
    .upsert(results, { onConflict: 'session_id,driver_id' })
  if (rErr) console.error(`[session_results] upsert failed (${sessionType}):`, rErr)

  // Race + sprint: precompute per-lap position so the client chart needs a
  // single round-trip instead of pivoting raw /position events itself.
  if (sessionType === 'race' || sessionType === 'sprint') {
    await upsertLapPositions(sb, sessionId, laps, positions, driverNumberToId)
  }
}

async function upsertLapPositions(
  sb: SupabaseClient,
  sessionId: string,
  laps: Awaited<ReturnType<typeof listLaps>>,
  positions: Awaited<ReturnType<typeof listPositions>>,
  driverNumberToId: Map<number, string>,
) {
  if (positions.length === 0 || laps.length === 0) return

  // Group position events by driver (sorted ascending by date).
  const posByDriver = new Map<number, { t: number; pos: number }[]>()
  for (const p of positions) {
    const arr = posByDriver.get(p.driver_number) ?? []
    arr.push({ t: new Date(p.date).getTime(), pos: p.position })
    posByDriver.set(p.driver_number, arr)
  }
  for (const arr of posByDriver.values()) arr.sort((a, b) => a.t - b.t)

  const rows: { session_id: string; driver_id: string; lap: number; position: number }[] = []
  for (const lap of laps) {
    const driverId = driverNumberToId.get(lap.driver_number)
    if (!driverId || !lap.date_start) continue
    const events = posByDriver.get(lap.driver_number)
    if (!events || events.length === 0) continue

    // "Position at start of lap N" = the latest position event at or before
    // this lap's date_start. Equivalent to "position at the end of lap N-1".
    const t = new Date(lap.date_start).getTime()
    let pos: number | null = null
    for (const ev of events) {
      if (ev.t <= t) pos = ev.pos
      else break
    }
    if (pos == null) continue
    rows.push({ session_id: sessionId, driver_id: driverId, lap: lap.lap_number, position: pos })
  }

  if (rows.length === 0) return
  // Chunk to stay under PostgREST's 1000-row body limit comfortably.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await sb
      .from('vizf1_session_lap_positions')
      .upsert(slice, { onConflict: 'session_id,driver_id,lap' })
    if (error) console.error('[session_lap_positions] upsert failed:', error)
  }
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
      const roster = new Map<number, OpenF1Driver>()
      for (const s of sessions) {
        await ingestSession(sb, raceId, s, roster)
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
