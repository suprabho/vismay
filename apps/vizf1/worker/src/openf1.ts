/**
 * Thin typed wrapper over OpenF1 (https://openf1.org).
 *
 * Jolpica/Ergast doesn't expose practice sessions, headshots, or per-driver
 * team colours — OpenF1 does. We use it for everything live-shaped (FP, sprint,
 * race-weekend metadata) and complement Jolpica's authoritative race results
 * where they overlap.
 *
 * Rate limit: undocumented, treat as ~60/min. The ingesters fetch sequentially
 * per session and cache aggressively.
 */

const BASE_URL = 'https://api.openf1.org/v1'

async function fetchOpenF1<T>(path: string): Promise<T[]> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'VizF1/1.0 (+https://vizf1.app)' },
  })
  if (!res.ok) {
    throw new Error(`OpenF1 ${res.status} ${path}`)
  }
  return (await res.json()) as T[]
}

// =====================================================
// Meetings (race weekends)
// =====================================================

export type OpenF1Meeting = {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  location: string
  country_name: string
  country_code: string
  circuit_key: number
  circuit_short_name: string
  date_start: string
  gmt_offset: string
  year: number
}

export function listMeetings(year: number): Promise<OpenF1Meeting[]> {
  return fetchOpenF1<OpenF1Meeting>(`/meetings?year=${year}`)
}

// =====================================================
// Sessions (Practice 1/2/3, Qualifying, Sprint, Race)
// =====================================================

export type OpenF1Session = {
  session_key: number
  meeting_key: number
  session_name: string // "Practice 1", "Sprint Qualifying", "Race", ...
  session_type: string // "Practice", "Qualifying", "Race"
  date_start: string
  date_end: string
  circuit_short_name: string
  year: number
}

export function listSessions(meetingKey: number): Promise<OpenF1Session[]> {
  return fetchOpenF1<OpenF1Session>(`/sessions?meeting_key=${meetingKey}`)
}

// =====================================================
// Drivers (per session — includes headshot_url + team colour)
// =====================================================

export type OpenF1Driver = {
  session_key: number
  meeting_key: number
  driver_number: number
  name_acronym: string
  full_name: string
  first_name: string
  last_name: string
  country_code: string | null
  team_name: string
  team_colour: string // hex without '#'
  headshot_url: string | null
}

export function listDrivers(sessionKey: number): Promise<OpenF1Driver[]> {
  return fetchOpenF1<OpenF1Driver>(`/drivers?session_key=${sessionKey}`)
}

// =====================================================
// Laps (per session) — used for best lap + laps completed.
// =====================================================

export type OpenF1Lap = {
  session_key: number
  driver_number: number
  lap_number: number
  lap_duration: number | null // seconds
  is_pit_out_lap: boolean
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
}

export function listLaps(sessionKey: number): Promise<OpenF1Lap[]> {
  return fetchOpenF1<OpenF1Lap>(`/laps?session_key=${sessionKey}`)
}

// =====================================================
// Position (final classification at session end)
// =====================================================

export type OpenF1Position = {
  session_key: number
  driver_number: number
  position: number
  date: string
}

export function listPositions(sessionKey: number): Promise<OpenF1Position[]> {
  return fetchOpenF1<OpenF1Position>(`/position?session_key=${sessionKey}`)
}

// =====================================================
// Location (car (x,y,z) over time — used to draw track outlines)
// =====================================================

export type OpenF1Location = {
  session_key: number
  driver_number: number
  date: string
  x: number
  y: number
  z: number
}

export function listLocations(
  sessionKey: number,
  driverNumber: number,
  fromIso: string,
  toIso: string,
): Promise<OpenF1Location[]> {
  return fetchOpenF1<OpenF1Location>(
    `/location?session_key=${sessionKey}&driver_number=${driverNumber}&date>=${encodeURIComponent(
      fromIso,
    )}&date<=${encodeURIComponent(toIso)}`,
  )
}

// =====================================================
// Helpers
// =====================================================

/**
 * OpenF1 names sessions inconsistently. Normalise to our DB enum.
 *
 *   "Practice 1"        → fp1
 *   "Practice 2"        → fp2
 *   "Practice 3"        → fp3
 *   "Qualifying"        → quali
 *   "Sprint Qualifying" → sprint_quali (older feeds called this "Sprint Shootout")
 *   "Sprint Shootout"   → sprint_quali
 *   "Sprint"            → sprint
 *   "Race"              → race
 */
export function normaliseSessionName(
  name: string,
): 'fp1' | 'fp2' | 'fp3' | 'quali' | 'sprint_quali' | 'sprint' | 'race' | null {
  const n = name.trim().toLowerCase()
  if (n === 'practice 1') return 'fp1'
  if (n === 'practice 2') return 'fp2'
  if (n === 'practice 3') return 'fp3'
  if (n === 'qualifying') return 'quali'
  if (n === 'sprint qualifying' || n === 'sprint shootout') return 'sprint_quali'
  if (n === 'sprint') return 'sprint'
  if (n === 'race') return 'race'
  return null
}

/**
 * Aggregate raw laps into one row per driver: best lap (ms) + laps completed.
 * Ignores pit-out laps (don't represent honest pace).
 */
export function aggregateLapsByDriver(
  laps: OpenF1Lap[],
): Map<number, { bestLapMs: number | null; lapsCompleted: number }> {
  const m = new Map<number, { bestLapMs: number | null; lapsCompleted: number }>()
  for (const l of laps) {
    const cur = m.get(l.driver_number) ?? { bestLapMs: null, lapsCompleted: 0 }
    cur.lapsCompleted = Math.max(cur.lapsCompleted, l.lap_number)
    if (!l.is_pit_out_lap && typeof l.lap_duration === 'number') {
      const ms = Math.round(l.lap_duration * 1000)
      if (cur.bestLapMs == null || ms < cur.bestLapMs) cur.bestLapMs = ms
    }
    m.set(l.driver_number, cur)
  }
  return m
}
