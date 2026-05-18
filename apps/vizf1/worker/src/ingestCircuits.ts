/**
 * Derives a track outline for each circuit from OpenF1 /location data.
 *
 * For each circuit row missing track_path_svg, find one finished Race session,
 * pull /location for a single driver over a 90-second window early in the race
 * (~one lap), downsample to ~500 points, fit to a 0..1000 viewBox, and write
 * an SVG `d` attribute.
 *
 * Run via: `pnpm --filter @vizf1/worker ingest:circuits`
 */

import { getSupabase } from './supabase'
import { listLocations, type OpenF1Location } from './openf1'

type SupabaseClient = ReturnType<typeof getSupabase>

type CircuitRow = { circuit_id: string; name: string; track_path_svg: string | null }

type SessionRow = {
  id: string
  session_key_openf1: number | null
  started_at: string | null
  race_id: string
  races: { circuit_id: string | null } | null
}

const TARGET_POINTS = 500

function downsample(points: OpenF1Location[], target: number): OpenF1Location[] {
  if (points.length <= target) return points
  const step = points.length / target
  const out: OpenF1Location[] = []
  for (let i = 0; i < target; i += 1) {
    out.push(points[Math.floor(i * step)]!)
  }
  return out
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

async function findRepresentativeSession(
  sb: SupabaseClient,
  circuitId: string,
): Promise<SessionRow | null> {
  const { data, error } = await sb
    .from('sessions')
    .select('id, session_key_openf1, started_at, race_id, races!inner(circuit_id)')
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

async function deriveTrack(sb: SupabaseClient, c: CircuitRow): Promise<boolean> {
  const session = await findRepresentativeSession(sb, c.circuit_id)
  if (!session || session.session_key_openf1 == null || !session.started_at) {
    console.log(`[circuits] no finished race session yet for ${c.circuit_id}`)
    return false
  }
  // Sample window: 5–7 minutes after race start (well past lap 1 traffic).
  const t0 = new Date(session.started_at)
  const fromIso = new Date(t0.getTime() + 5 * 60_000).toISOString()
  const toIso = new Date(t0.getTime() + 7 * 60_000).toISOString()

  // Driver 1 (just pick the lowest car number that has data — most weekends #1 or #4)
  // OpenF1 doesn't easily give us "pick any one" — try 1, then 44, then 4, then 16, then 11.
  const candidates = [1, 44, 4, 16, 11, 81, 63, 14, 22, 23]
  let locs: OpenF1Location[] = []
  for (const num of candidates) {
    try {
      locs = await listLocations(session.session_key_openf1, num, fromIso, toIso)
      if (locs.length > 100) break
    } catch (e) {
      console.warn(`[circuits] location fetch failed for ${c.circuit_id} d#${num}:`, e)
    }
  }
  if (locs.length < 100) {
    console.log(`[circuits] not enough location samples for ${c.circuit_id} (got ${locs.length})`)
    return false
  }

  const reduced = downsample(locs, TARGET_POINTS)
  const { d, bounds } = toSvgPath(reduced)

  const { error } = await sb
    .from('circuits')
    .update({
      track_path_svg: d,
      track_bounds: bounds,
      updated_at: new Date().toISOString(),
    })
    .eq('circuit_id', c.circuit_id)
  if (error) {
    console.error(`[circuits] update failed for ${c.circuit_id}:`, error)
    return false
  }
  console.log(`[circuits] ${c.circuit_id} — ${reduced.length} pts`)
  return true
}

export async function runIngestCircuits() {
  const sb = getSupabase()
  console.log(`[ingest:circuits] start ${new Date().toISOString()}`)
  const { data, error } = await sb
    .from('circuits')
    .select('circuit_id, name, track_path_svg')
    .is('track_path_svg', null)
  if (error) throw error
  const pending = (data ?? []) as CircuitRow[]
  console.log(`[ingest:circuits] ${pending.length} circuits missing geometry`)
  for (const c of pending) {
    await deriveTrack(sb, c)
  }
  console.log(`[ingest:circuits] done`)
}

if (require.main === module) {
  runIngestCircuits()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}
