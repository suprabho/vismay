/**
 * Derives a track outline for each circuit from OpenF1 /location data.
 *
 * Strategy: for each circuit we find one finished Race session, look at its lap
 * timing to pick a *clean racing lap* for a driver (not a pit / safety-car /
 * out lap), then pull /location for exactly that lap window. One clean lap traces
 * the full circuit and returns to its start, so it projects to a proper closed
 * outline. We try several driver/lap candidates and keep the first that passes a
 * geometry sanity check (a real loop, not a dot, a straight line, or a partial
 * lap). If nothing passes we store nothing rather than a misleading shape.
 *
 * Re-runs are self-healing: a circuit whose stored geometry is degenerate (the
 * old fixed-window sampler could emit a dot when a driver was stationary, or a
 * stray line when its window straddled a pit stop) is re-derived. If a valid
 * outline still can't be produced, its geometry is cleared to null so the UI
 * shows an honest "not yet available" placeholder instead of a wrong shape.
 *
 * Run via:
 *   `pnpm --filter @vizf1/worker ingest:circuits`            (missing + broken)
 *   `pnpm --filter @vizf1/worker ingest:circuits -- --force` (re-derive all)
 */

import { getSupabase } from './supabase'
import { listLaps, listLocations, type OpenF1Lap, type OpenF1Location } from './openf1'

type SupabaseClient = ReturnType<typeof getSupabase>

type CircuitRow = { circuit_id: string; name: string; track_path_svg: string | null }

type SessionRow = {
  id: string
  session_key_openf1: number | null
  started_at: string | null
  race_id: string
  races: { circuit_id: string | null } | null
}

type Point = { x: number; y: number }

const TARGET_POINTS = 500
// Plausible F1 lap length. Anything outside this is a timing artefact (a split
// lap, a red-flag-spanning row, a stationary "lap") and not a clean reference.
const MIN_LAP_SECONDS = 45
const MAX_LAP_SECONDS = 180
// A clean lap is within this multiple of the driver's fastest — filters out
// safety-car / traffic / in-laps that don't trace the racing line cleanly.
const CLEAN_LAP_TOLERANCE = 1.07
// How many driver/lap candidates to attempt before giving up on a circuit.
const MAX_CANDIDATES = 8

function downsample<T>(points: T[], target: number): T[] {
  if (points.length <= target) return points
  const step = points.length / target
  const out: T[] = []
  for (let i = 0; i < target; i += 1) {
    out.push(points[Math.floor(i * step)]!)
  }
  return out
}

/** Drop consecutive duplicate samples (a parked car emits many identical rows). */
function dedupeConsecutive(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p)
  }
  return out
}

/**
 * Decide whether a set of (x,y) samples forms a believable closed circuit lap.
 *
 * Rejects the three failure modes seen in production:
 *   - a dot          → all samples clustered (tiny/zero bounding box, ~no path)
 *   - a straight line → one axis collapses, encloses ~no area, doesn't wind
 *   - a partial lap   → path doesn't return near its start (poor closure)
 *
 * All tests are scale-free ratios so they hold regardless of OpenF1's raw units.
 */
function isPlausibleLoop(points: Point[]): boolean {
  const pts = dedupeConsecutive(points)
  if (pts.length < 50) return false

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  if (diag <= 0) return false // a dot

  // Neither axis may collapse — kills a pure back-and-forth line.
  const minSpan = Math.min(w, h) / Math.max(w, h)
  if (minSpan < 0.06) return false

  // Perimeter must be meaningfully longer than the bounding diagonal: a real lap
  // winds around, a dot barely moves. A smooth oval (the least windy closed loop)
  // sits near 2.2, so stay below that; the closure + area tests reject the rest.
  let perim = 0
  for (let i = 1; i < pts.length; i += 1) {
    perim += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  }
  if (perim / diag < 2) return false

  // A closed lap returns near its start.
  const gap = Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y)
  if (gap / diag > 0.25) return false

  // The outline must enclose meaningful area (shoelace), not hug a line.
  let area2 = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    area2 += a.x * b.y - b.x * a.y
  }
  const fill = Math.abs(area2) / 2 / (w * h)
  if (fill < 0.05) return false

  return true
}

function toSvgPath(points: OpenF1Location[]): {
  d: string
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const scale = 1000 / Math.max(w, h)
  // Invert Y so SVG renders north-up.
  const project = (p: OpenF1Location) => ({
    x: (p.x - minX) * scale,
    y: 1000 - (p.y - minY) * scale,
  })
  const segs: string[] = []
  points.forEach((p, i) => {
    const { x, y } = project(p)
    segs.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  })
  segs.push('Z')
  return { d: segs.join(' '), bounds: { minX, maxX, minY, maxY } }
}

/** Parse the numeric coords back out of a stored `d` string, to re-validate it. */
function parsePathPoints(d: string): Point[] {
  const out: Point[] = []
  const re = /[ML]\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d)) !== null) {
    out.push({ x: Number(m[1]), y: Number(m[2]) })
  }
  return out
}

type LapWindow = { driverNumber: number; lapNumber: number; fromIso: string; toIso: string }

/**
 * From a session's lap timing, build an ordered list of clean-lap sampling
 * windows — one per driver, using that driver's median clean lap (stable, avoids
 * the single fastest outlier). Drivers ordered by lap count (more laps ⇒ more
 * reliable telemetry) so the best candidates are tried first.
 */
function cleanLapWindows(laps: OpenF1Lap[]): LapWindow[] {
  const byDriver = new Map<number, OpenF1Lap[]>()
  for (const l of laps) {
    if (l.is_pit_out_lap) continue
    if (!l.date_start || typeof l.lap_duration !== 'number') continue
    if (l.lap_duration < MIN_LAP_SECONDS || l.lap_duration > MAX_LAP_SECONDS) continue
    const arr = byDriver.get(l.driver_number) ?? []
    arr.push(l)
    byDriver.set(l.driver_number, arr)
  }

  const windows: { lapCount: number; win: LapWindow }[] = []
  for (const [driverNumber, dl] of byDriver) {
    const fastest = Math.min(...dl.map((l) => l.lap_duration as number))
    const clean = dl
      .filter((l) => (l.lap_duration as number) <= fastest * CLEAN_LAP_TOLERANCE)
      .sort((a, b) => (a.lap_duration as number) - (b.lap_duration as number))
    if (clean.length === 0) continue
    const lap = clean[Math.floor(clean.length / 2)]!
    const start = new Date(lap.date_start as string)
    // Pad the tail slightly so the final samples overlap the start line.
    const end = new Date(start.getTime() + ((lap.lap_duration as number) + 2) * 1000)
    windows.push({
      lapCount: dl.length,
      win: {
        driverNumber,
        lapNumber: lap.lap_number,
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
      },
    })
  }

  return windows
    .sort((a, b) => b.lapCount - a.lapCount)
    .slice(0, MAX_CANDIDATES)
    .map((w) => w.win)
}

async function findRepresentativeSession(
  sb: SupabaseClient,
  circuitId: string,
): Promise<SessionRow | null> {
  const { data, error } = await sb
    .from('vizf1_sessions')
    .select('id, session_key_openf1, started_at, race_id, races:vizf1_races!inner(circuit_id)')
    .eq('session_type', 'race')
    .eq('status', 'finished')
    .eq('races.circuit_id', circuitId)
    .order('started_at', { ascending: false })
    .limit(1)
  if (error) {
    console.error(`[circuits] session lookup failed for ${circuitId}:`, error)
    return null
  }
  return (data?.[0] as unknown as SessionRow) ?? null
}

/** True if a circuit's stored geometry already passes the loop sanity check. */
function storedGeometryIsHealthy(svg: string | null): boolean {
  if (!svg) return false
  return isPlausibleLoop(parsePathPoints(svg))
}

type DeriveResult = 'stored' | 'no-session' | 'no-valid-lap'

async function deriveTrack(sb: SupabaseClient, c: CircuitRow): Promise<DeriveResult> {
  const session = await findRepresentativeSession(sb, c.circuit_id)
  if (!session || session.session_key_openf1 == null) {
    console.log(`[circuits] no finished race session yet for ${c.circuit_id}`)
    return 'no-session'
  }

  const sessionKey = session.session_key_openf1
  let laps: OpenF1Lap[] = []
  try {
    laps = await listLaps(sessionKey)
  } catch (e) {
    console.warn(`[circuits] lap fetch failed for ${c.circuit_id}:`, e)
  }

  let candidates = cleanLapWindows(laps)

  // Fallback when lap timing is unavailable: sample a couple of fixed windows a
  // few minutes into the race (past lap-1 traffic) for a handful of drivers.
  if (candidates.length === 0 && session.started_at) {
    const t0 = new Date(session.started_at).getTime()
    const drivers = [1, 44, 4, 16, 11, 81, 63, 14]
    candidates = drivers.map((driverNumber, i) => ({
      driverNumber,
      lapNumber: -1,
      fromIso: new Date(t0 + (5 + i) * 60_000).toISOString(),
      toIso: new Date(t0 + (7 + i) * 60_000).toISOString(),
    }))
  }

  for (const cand of candidates) {
    let locs: OpenF1Location[] = []
    try {
      locs = await listLocations(sessionKey, cand.driverNumber, cand.fromIso, cand.toIso)
    } catch (e) {
      console.warn(
        `[circuits] location fetch failed for ${c.circuit_id} d#${cand.driverNumber}:`,
        e,
      )
      continue
    }
    if (locs.length < 100) continue
    if (!isPlausibleLoop(locs)) continue

    const reduced = downsample(locs, TARGET_POINTS)
    const { d, bounds } = toSvgPath(reduced)

    const { error } = await sb
      .from('vizf1_circuits')
      .update({
        track_path_svg: d,
        track_bounds: bounds,
        updated_at: new Date().toISOString(),
      })
      .eq('circuit_id', c.circuit_id)
    if (error) {
      console.error(`[circuits] update failed for ${c.circuit_id}:`, error)
      return 'no-valid-lap'
    }
    const lapDesc = cand.lapNumber > 0 ? `lap ${cand.lapNumber}` : 'fixed window'
    console.log(
      `[circuits] ${c.circuit_id} — ${reduced.length} pts (d#${cand.driverNumber}, ${lapDesc})`,
    )
    return 'stored'
  }

  console.log(`[circuits] no clean lap produced a valid outline for ${c.circuit_id}`)
  return 'no-valid-lap'
}

/** Clear stored geometry so the UI falls back to the honest placeholder. */
async function clearGeometry(sb: SupabaseClient, circuitId: string): Promise<void> {
  const { error } = await sb
    .from('vizf1_circuits')
    .update({ track_path_svg: null, track_bounds: null, updated_at: new Date().toISOString() })
    .eq('circuit_id', circuitId)
  if (error) console.error(`[circuits] clear failed for ${circuitId}:`, error)
}

export async function runIngestCircuits(opts: { force?: boolean } = {}) {
  const sb = getSupabase()
  console.log(`[ingest:circuits] start ${new Date().toISOString()}${opts.force ? ' (force)' : ''}`)

  const { data, error } = await sb
    .from('vizf1_circuits')
    .select('circuit_id, name, track_path_svg')
  if (error) throw error
  const all = (data ?? []) as CircuitRow[]

  // Process circuits missing geometry, plus any whose stored outline is broken
  // (dot / line / partial lap from the old sampler). --force re-derives all.
  const pending = all.filter(
    (c) => opts.force || !c.track_path_svg || !storedGeometryIsHealthy(c.track_path_svg),
  )
  const broken = pending.filter((c) => c.track_path_svg && !storedGeometryIsHealthy(c.track_path_svg))
  console.log(
    `[ingest:circuits] ${pending.length} to process (${broken.length} with broken geometry)`,
  )

  for (const c of pending) {
    const hadGeometry = Boolean(c.track_path_svg)
    const result = await deriveTrack(sb, c)
    // If a circuit previously showed a wrong shape and we still can't derive a
    // valid one, clear it so users see the honest placeholder instead.
    if (result === 'no-valid-lap' && hadGeometry && !storedGeometryIsHealthy(c.track_path_svg)) {
      await clearGeometry(sb, c.circuit_id)
      console.log(`[circuits] cleared broken geometry for ${c.circuit_id}`)
    }
  }
  console.log(`[ingest:circuits] done`)
}

if (require.main === module) {
  const force = process.argv.includes('--force')
  runIngestCircuits({ force })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
