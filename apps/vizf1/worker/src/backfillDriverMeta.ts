/**
 * VizF1 driver/constructor metadata backfill.
 *
 * Standings rows render monogram chips (instead of headshots) and stay
 * un-tinted whenever `vizf1_drivers.headshot_url` / `vizf1_drivers.primary_color`
 * (and `vizf1_constructors.primary_color`) are NULL. The full session ingest
 * already writes those fields, but a full re-run re-pulls every lap + position
 * for the whole season just to refresh two columns.
 *
 * This script does the cheap, targeted thing: walk the season's meetings on
 * OpenF1, read ONE drivers list per meeting (the race session, or the latest
 * finished session), and fill the metadata columns.
 *
 *   - Non-destructive by default: only NULL/empty columns are written.
 *   - `--force` overwrites existing values too (use after a livery/colour change).
 *   - Colours fall back to a curated palette when OpenF1 omits `team_colour`.
 *   - Headshots have no fallback (OpenF1 is the only source); pass extra prior
 *     years to gap-fill drivers whose current-season rows have a null headshot.
 *
 * Run via:
 *   pnpm --filter @vizf1/worker backfill:driver-meta            # current year, fill-only
 *   pnpm --filter @vizf1/worker backfill:driver-meta 2026 2025  # scan these years
 *   pnpm --filter @vizf1/worker backfill:driver-meta --force    # overwrite existing
 */

import { getSupabase } from './supabase'
import {
  listMeetings,
  listSessions,
  listDrivers,
  normaliseSessionName,
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

/**
 * Curated constructor accent colours, keyed by `slug(team_name)` as OpenF1
 * spells the team. Only consulted when OpenF1's own `team_colour` is missing,
 * so it just needs to keep the table from rendering a grey row. Mirrors the
 * palette in @vizf1/brand but uses the worker's slug form (e.g. `red_bull_racing`
 * not `red_bull`), and covers a couple of name variants OpenF1 has used.
 */
const CONSTRUCTOR_COLOR_FALLBACK: Record<string, string> = {
  red_bull_racing: '#3671C6',
  ferrari: '#E8002D',
  mercedes: '#27F4D2',
  mclaren: '#FF8000',
  aston_martin: '#229971',
  alpine: '#0093CC',
  williams: '#64C4FF',
  rb: '#6692FF',
  racing_bulls: '#6692FF',
  kick_sauber: '#52E252',
  sauber: '#52E252',
  haas_f1_team: '#B6BABD',
  haas: '#B6BABD',
}

function hex(teamColour: string | null | undefined): string | null {
  if (!teamColour) return null
  const c = teamColour.trim()
  if (!c) return null
  return c.startsWith('#') ? c : `#${c}`
}

type DriverMeta = {
  driver_id: string
  given_name: string
  family_name: string
  code: string | null
  constructor_id: string
  headshot_url: string | null
  primary_color: string | null
}

type ConstructorMeta = {
  constructor_id: string
  name: string
  primary_color: string | null
}

/** Pick the drivers list that best represents a meeting's grid: the race, else the latest session. */
function pickSessionKey(sessions: Awaited<ReturnType<typeof listSessions>>): number | null {
  if (sessions.length === 0) return null
  const race = sessions.find((s) => normaliseSessionName(s.session_name) === 'race')
  if (race) return race.session_key
  const latest = [...sessions].sort((a, b) => b.date_start.localeCompare(a.date_start))[0]
  return latest?.session_key ?? null
}

/**
 * Walk the given years on OpenF1 and accumulate the most recent NON-NULL
 * metadata per driver / constructor. Years are visited oldest→newest so a
 * later season overrides an earlier one, but only when its value is present —
 * so a null current-season headshot keeps the prior-season fallback.
 */
async function collectMeta(years: number[]): Promise<{
  drivers: Map<string, DriverMeta>
  constructors: Map<string, ConstructorMeta>
}> {
  const drivers = new Map<string, DriverMeta>()
  const constructors = new Map<string, ConstructorMeta>()

  const applyDriver = (d: OpenF1Driver) => {
    const id = slug(`${d.first_name}_${d.last_name}`)
    const constructorId = slug(d.team_name)
    const color = hex(d.team_colour)
    const prev = drivers.get(id)
    drivers.set(id, {
      driver_id: id,
      given_name: d.first_name,
      family_name: d.last_name,
      code: d.name_acronym ?? prev?.code ?? null,
      constructor_id: constructorId,
      // Keep the most recent non-null value seen; never clobber back to null.
      headshot_url: d.headshot_url ?? prev?.headshot_url ?? null,
      primary_color: color ?? prev?.primary_color ?? null,
    })

    const prevC = constructors.get(constructorId)
    constructors.set(constructorId, {
      constructor_id: constructorId,
      name: d.team_name,
      primary_color: color ?? prevC?.primary_color ?? null,
    })
  }

  for (const year of years) {
    const meetings = await listMeetings(year)
    meetings.sort((a, b) => a.date_start.localeCompare(b.date_start))
    for (const m of meetings) {
      try {
        const sessions = await listSessions(m.meeting_key)
        const sessionKey = pickSessionKey(sessions)
        if (sessionKey == null) continue
        const list = await listDrivers(sessionKey)
        for (const d of list) applyDriver(d)
      } catch (e) {
        console.error(`[backfill:driver-meta] ${year} meeting ${m.meeting_name} failed:`, e)
      }
    }
    console.log(`[backfill:driver-meta] scanned ${year} (${meetings.length} meetings)`)
  }

  // Colour fallback for constructors OpenF1 left blank.
  for (const c of constructors.values()) {
    if (!c.primary_color) c.primary_color = CONSTRUCTOR_COLOR_FALLBACK[c.constructor_id] ?? null
  }

  return { drivers, constructors }
}

export async function runBackfillDriverMeta(years: number[], force: boolean) {
  const sb: SupabaseClient = getSupabase()
  console.log(
    `[backfill:driver-meta] start years=${years.join(',')} mode=${force ? 'force' : 'fill-only'}`,
  )

  const { drivers, constructors } = await collectMeta(years)
  console.log(
    `[backfill:driver-meta] collected ${drivers.size} drivers, ${constructors.size} constructors from OpenF1`,
  )

  let driversWritten = 0
  let constructorsWritten = 0

  // --- Constructors ---
  const { data: existingC, error: cReadErr } = await sb
    .from('vizf1_constructors')
    .select('constructor_id, primary_color')
  if (cReadErr) throw cReadErr
  const existingCById = new Map((existingC ?? []).map((r) => [r.constructor_id as string, r]))

  for (const c of constructors.values()) {
    const row = existingCById.get(c.constructor_id)
    if (!row) continue // constructor not in DB — leave to the full ingest to create
    const needsColor = force || !row.primary_color
    if (!needsColor || !c.primary_color) continue
    const { error } = await sb
      .from('vizf1_constructors')
      .update({ primary_color: c.primary_color, updated_at: new Date().toISOString() })
      .eq('constructor_id', c.constructor_id)
    if (error) {
      console.error(`[backfill:driver-meta] constructor ${c.constructor_id} update failed:`, error)
    } else {
      constructorsWritten += 1
    }
  }

  // --- Drivers ---
  const { data: existingD, error: dReadErr } = await sb
    .from('vizf1_drivers')
    .select('driver_id, headshot_url, primary_color')
  if (dReadErr) throw dReadErr
  const existingDById = new Map((existingD ?? []).map((r) => [r.driver_id as string, r]))

  for (const d of drivers.values()) {
    const row = existingDById.get(d.driver_id)
    if (!row) continue // driver not in DB — full ingest owns row creation
    const patch: { headshot_url?: string; primary_color?: string } = {}
    if (d.headshot_url && (force || !row.headshot_url)) patch.headshot_url = d.headshot_url
    if (d.primary_color && (force || !row.primary_color)) patch.primary_color = d.primary_color
    if (Object.keys(patch).length === 0) continue
    const { error } = await sb
      .from('vizf1_drivers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('driver_id', d.driver_id)
    if (error) {
      console.error(`[backfill:driver-meta] driver ${d.driver_id} update failed:`, error)
    } else {
      driversWritten += 1
    }
  }

  console.log(
    `[backfill:driver-meta] done — updated ${driversWritten} drivers, ${constructorsWritten} constructors`,
  )
}

if (require.main === module) {
  const argv = process.argv.slice(2)
  const force = argv.includes('--force')
  const years = argv
    .filter((a) => /^\d{4}$/.test(a))
    .map(Number)
  const resolvedYears = years.length > 0 ? years : [new Date().getFullYear()]
  runBackfillDriverMeta(resolvedYears, force)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
