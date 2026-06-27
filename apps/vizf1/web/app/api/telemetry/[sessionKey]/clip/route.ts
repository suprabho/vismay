import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

/**
 * GET /api/telemetry/<sessionKey>/clip
 *
 * Bundles everything the f1:telemetry-clip player needs for a lap window:
 * circuit geometry, focal-driver meta, per-lap timing, sector bests,
 * lap-windowed car-position tracks, and stride-downsampled telemetry traces.
 * Ported from the f1_backend donor's getTelemetryClip, reading Supabase.
 *
 * Query: drivers=1,44 (≤3) & lapFrom & lapTo & channels=speed,throttle,brake & hz=15 (≤30)
 */
export const dynamic = 'force-dynamic'

const VALID_CHANNELS = new Set(['speed', 'throttle', 'brake', 'drs', 'nGear', 'rpm'])

function downsampleByStride<T>(arr: T[] | undefined, stride: number): T[] {
  if (!arr || arr.length === 0) return []
  if (stride <= 1) return arr.slice()
  const out: T[] = []
  for (let i = 0; i < arr.length; i += stride) out.push(arr[i])
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1])
  return out
}

interface DriverJson {
  driverNumber: number
  abbreviation?: string
  fullName?: string
  teamName?: string
  teamColour?: string
}

interface PosFrames {
  t: number[]
  x: number[]
  y: number[]
  z?: number[]
  lap: number[]
  status: number[]
}

interface LapRow {
  driver_number: number
  lap: number
  lap_time_sec: number | null
  sectors: Array<number | null> | null
  compound: string | null
  stint_lap: number | null
}

interface ChannelRow {
  driver_number: number
  lap: number
  channels: Record<string, number[]>
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionKey: string }> },
) {
  const { sessionKey } = await ctx.params
  const url = new URL(req.url)

  const lapFrom = Number(url.searchParams.get('lapFrom'))
  const lapTo = Number(url.searchParams.get('lapTo'))
  const driversRaw = (url.searchParams.get('drivers') ?? '').trim()
  if (!driversRaw || !Number.isFinite(lapFrom) || !Number.isFinite(lapTo) || lapTo < lapFrom) {
    return NextResponse.json(
      { message: 'drivers, lapFrom and lapTo (lapTo >= lapFrom) are required' },
      { status: 400 },
    )
  }

  const driverNumbers = driversRaw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 3)
  if (driverNumbers.length === 0) {
    return NextResponse.json({ message: 'drivers must contain a numeric driver number' }, { status: 400 })
  }

  const channels = (url.searchParams.get('channels') ?? 'speed,throttle,brake')
    .split(',')
    .map((s) => s.trim())
    .filter((c) => VALID_CHANNELS.has(c))

  const hzRaw = Number(url.searchParams.get('hz'))
  const targetHz = Number.isFinite(hzRaw) ? Math.min(30, Math.max(1, hzRaw)) : 15

  const db = supabaseServer()

  const { data: sess } = await db
    .from('vizf1_telemetry_sessions')
    .select('session_key, circuit_key, season, circuit_name, drivers, positions_status')
    .eq('session_key', sessionKey)
    .maybeSingle()
  if (!sess) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 })
  }
  const s = sess as {
    session_key: string
    circuit_key: string
    season: number
    circuit_name: string | null
    drivers: unknown
    positions_status: string | null
  }

  const [{ data: circ }, { data: lapRows }, { data: posRows }, { data: telRows }] = await Promise.all([
    db
      .from('vizf1_telemetry_circuits')
      .select('*')
      .eq('circuit_key', s.circuit_key)
      .eq('year', s.season)
      .maybeSingle(),
    db
      .from('vizf1_telemetry_laps')
      .select('driver_number, lap, lap_time_sec, sectors, compound, stint_lap')
      .eq('session_key', sessionKey)
      .in('driver_number', driverNumbers)
      .gte('lap', lapFrom)
      .lte('lap', lapTo),
    db.from('vizf1_car_positions').select('*').eq('session_key', sessionKey).in('driver_number', driverNumbers),
    db
      .from('vizf1_lap_telemetry')
      .select('driver_number, lap, channels')
      .eq('session_key', sessionKey)
      .in('driver_number', driverNumbers)
      .gte('lap', lapFrom)
      .lte('lap', lapTo),
  ])

  // Focal driver meta
  const roster = Array.isArray(s.drivers) ? (s.drivers as DriverJson[]) : []
  const drivers = roster
    .filter((d) => driverNumbers.includes(d.driverNumber))
    .map((d) => ({
      driverNumber: d.driverNumber,
      abbreviation: d.abbreviation ?? '',
      fullName: d.fullName ?? '',
      teamName: d.teamName ?? '',
      teamColour: d.teamColour ?? '#ffffff',
    }))

  // Per-driver laps in range + sector bests
  const lapsByDriver: Record<number, Array<{ driverNumber: number; lap: number; lapTimeSec: number | null; sectors: Array<number | null>; compound: string; stintLap: number }>> = {}
  for (const dn of driverNumbers) lapsByDriver[dn] = []
  for (const l of (lapRows ?? []) as LapRow[]) {
    lapsByDriver[l.driver_number]?.push({
      driverNumber: l.driver_number,
      lap: l.lap,
      lapTimeSec: l.lap_time_sec ?? null,
      sectors: l.sectors ?? [],
      compound: l.compound ?? 'UNKNOWN',
      stintLap: l.stint_lap ?? 0,
    })
  }

  const sectorBests: Record<number, { s1: number; s2: number; s3: number; s1Lap: number; s2Lap: number; s3Lap: number }> = {}
  for (const dn of driverNumbers) {
    let s1 = Infinity, s2 = Infinity, s3 = Infinity
    let s1Lap = 0, s2Lap = 0, s3Lap = 0
    for (const lap of lapsByDriver[dn]) {
      const a = lap.sectors[0] ?? 0
      const b = lap.sectors[1] ?? 0
      const c = lap.sectors[2] ?? 0
      if (a > 0 && a < s1) { s1 = a; s1Lap = lap.lap }
      if (b > 0 && b < s2) { s2 = b; s2Lap = lap.lap }
      if (c > 0 && c < s3) { s3 = c; s3Lap = lap.lap }
    }
    sectorBests[dn] = {
      s1: Number.isFinite(s1) ? s1 : 0,
      s2: Number.isFinite(s2) ? s2 : 0,
      s3: Number.isFinite(s3) ? s3 : 0,
      s1Lap, s2Lap, s3Lap,
    }
  }

  // Car positions clipped to the lap window
  const tracks = (posRows ?? []).map((p) => {
    const row = p as Record<string, unknown>
    const f = (row.frames as PosFrames) ?? { t: [], x: [], y: [], lap: [], status: [] }
    const ft: number[] = [], fx: number[] = [], fy: number[] = [], fl: number[] = [], fsv: number[] = []
    const fz: number[] = []
    const hasZ = Array.isArray(f.z)
    for (let i = 0; i < f.t.length; i++) {
      const lapNum = f.lap[i]
      if (lapNum < lapFrom || lapNum > lapTo) continue
      ft.push(f.t[i]); fx.push(f.x[i]); fy.push(f.y[i]); fl.push(lapNum); fsv.push(f.status[i])
      if (hasZ) fz.push((f.z as number[])[i])
    }
    return {
      driverNumber: row.driver_number as number,
      sampleRateHz: (row.sample_rate_hz as number) ?? 4,
      frameCount: ft.length,
      t0Ms: ft[0] ?? 0,
      tEndMs: ft[ft.length - 1] ?? 0,
      frames: hasZ ? { t: ft, x: fx, y: fy, z: fz, lap: fl, status: fsv } : { t: ft, x: fx, y: fy, lap: fl, status: fsv },
    }
  })

  // 202 if positions aren't ready
  if (tracks.length === 0 && drivers.length > 0 && s.positions_status !== 'done') {
    return NextResponse.json(
      { status: 'positions_not_ready', positionsStatus: s.positions_status ?? 'unknown' },
      { status: 202 },
    )
  }

  // Raw telemetry traces, stride-downsampled to targetHz
  const telemetry: Array<Record<string, unknown>> = []
  for (const row of (telRows ?? []) as ChannelRow[]) {
    const ch = row.channels ?? {}
    const sessionTime = ch.sessionTime ?? []
    const native = sessionTime.length
    if (native === 0) continue
    const durationSec = native > 1 ? Math.max(0.001, sessionTime[native - 1] - sessionTime[0]) : 1
    const nativeHz = native / durationSec
    const stride = Math.max(1, Math.round(nativeHz / targetHz))
    const entry: Record<string, unknown> = {
      driverNumber: row.driver_number,
      lap: row.lap,
      sampleRateHz: targetHz,
      sessionTime: downsampleByStride(sessionTime, stride),
      distance: downsampleByStride(ch.distance ?? [], stride),
    }
    for (const c of channels) entry[c] = downsampleByStride(ch[c], stride)
    entry.frameCount = (entry.sessionTime as number[]).length
    telemetry.push(entry)
  }

  const circuit = circ
    ? {
        circuitKey: (circ as Record<string, unknown>).circuit_key,
        circuitName: (circ as Record<string, unknown>).circuit_name,
        country: (circ as Record<string, unknown>).country ?? '',
        year: (circ as Record<string, unknown>).year,
        gpName: (circ as Record<string, unknown>).gp_name ?? '',
        rotationDeg: (circ as Record<string, unknown>).rotation_deg ?? 0,
        corners: (circ as Record<string, unknown>).corners ?? [],
        outline: (circ as Record<string, unknown>).outline ?? { x: [], y: [] },
        bounds: (circ as Record<string, unknown>).bounds ?? null,
        sectorBoundaries: (circ as Record<string, unknown>).sector_boundaries ?? null,
      }
    : null

  return NextResponse.json(
    {
      sessionKey,
      circuitKey: s.circuit_key,
      circuitName: s.circuit_name,
      year: s.season,
      lapFrom,
      lapTo,
      channels,
      drivers,
      circuit,
      lapsByDriver,
      sectorBests,
      tracks,
      telemetry,
    },
    { headers: { 'Cache-Control': 'public, max-age=300, must-revalidate' } },
  )
}
