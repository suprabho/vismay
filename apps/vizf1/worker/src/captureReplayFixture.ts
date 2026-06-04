/**
 * Captures a REAL race-replay fixture from OpenF1 `/location` (the ~3.7 Hz car
 * (x,y) feed). Produces the same `ReplayFixture` shape the synthetic generator
 * does, so it drops straight into apps/vizf1/web/public/fixtures/.
 *
 * This is the "real data" path behind the fixture-first replay. It is heavy
 * (OpenF1 rate-limits hard) so it's a manual one-off, not part of the ingest
 * cron. Window it to a few laps + a handful of drivers for a sane file size.
 *
 * Usage:
 *   SESSION_KEY=9472 MAX_LAPS=10 DRIVERS=1,4,16,44,63,81 OUT=replay-demo.json \
 *     pnpm --filter @vizf1/worker exec tsx src/captureReplayFixture.ts
 *
 *   SESSION_KEY  OpenF1 race session_key (required). Find via /sessions.
 *   MAX_LAPS     cap to the first N laps (default: whole race).
 *   DRIVERS      comma list of car numbers (default: all in the session).
 *   OUT          output filename under web/public/fixtures (default replay-<key>.json).
 *   SAMPLE_HZ    downsample target (default 2).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { listDrivers, listLaps, listLocations, type OpenF1Location } from './openf1'

const BASE_URL = 'https://api.openf1.org/v1'
const SESSION_KEY = Number(process.env.SESSION_KEY)
const MAX_LAPS = process.env.MAX_LAPS ? Number(process.env.MAX_LAPS) : Infinity
const SAMPLE_HZ = process.env.SAMPLE_HZ ? Number(process.env.SAMPLE_HZ) : 2
const DRIVER_FILTER = process.env.DRIVERS
  ? new Set(process.env.DRIVERS.split(',').map((s) => Number(s.trim())))
  : null
const OUT_NAME = process.env.OUT ?? `replay-${SESSION_KEY}.json`
const OUT = resolve(__dirname, '../../../apps/vizf1/web/public/fixtures', OUT_NAME)

const DT_MS = 1000 / SAMPLE_HZ

interface SessionInfo {
  date_start: string
  date_end: string
  circuit_short_name: string
  circuit_key: number
  country_name: string
  year: number
}

async function getSession(sessionKey: number): Promise<SessionInfo> {
  const res = await fetch(`${BASE_URL}/sessions?session_key=${sessionKey}`, {
    headers: { 'User-Agent': 'VizF1/1.0 (+https://vizf1.app)' },
  })
  if (!res.ok) throw new Error(`OpenF1 sessions ${res.status}`)
  const rows = (await res.json()) as SessionInfo[]
  if (!rows.length) throw new Error(`No session ${sessionKey}`)
  return rows[0]
}

/** First location per DT_MS bucket (drops 0,0 "no signal" frames). */
function downsampleByTime(locs: OpenF1Location[], startMs: number): OpenF1Location[] {
  const out: OpenF1Location[] = []
  let lastBucket = -1
  for (const l of locs) {
    if (l.x === 0 && l.y === 0) continue
    const bucket = Math.floor((Date.parse(l.date) - startMs) / DT_MS)
    if (bucket !== lastBucket) {
      out.push(l)
      lastBucket = bucket
    }
  }
  return out
}

async function main() {
  if (!Number.isFinite(SESSION_KEY)) throw new Error('SESSION_KEY env var is required')

  console.log(`[capture] session ${SESSION_KEY} → ${OUT_NAME}`)
  const session = await getSession(SESSION_KEY)
  const startMs = Date.parse(session.date_start)

  const drivers = await listDrivers(SESSION_KEY)
  const laps = await listLaps(SESSION_KEY)

  // Per-driver lap boundaries (lap → date_start ms) for bucketing frames.
  const lapStartsByDriver = new Map<number, Array<{ lap: number; ms: number }>>()
  const lapDurByDriver = new Map<number, Map<number, number>>()
  let leaderLapStarts: Array<{ lap: number; ms: number }> = []
  for (const l of laps) {
    if (l.date_start) {
      const arr = lapStartsByDriver.get(l.driver_number) ?? []
      arr.push({ lap: l.lap_number, ms: Date.parse(l.date_start) })
      lapStartsByDriver.set(l.driver_number, arr)
    }
    if (typeof l.lap_duration === 'number') {
      const m = lapDurByDriver.get(l.driver_number) ?? new Map()
      m.set(l.lap_number, l.lap_duration)
      lapDurByDriver.set(l.driver_number, m)
    }
  }
  for (const arr of lapStartsByDriver.values()) arr.sort((a, b) => a.lap - b.lap)
  // Use the driver with the most recorded laps as the leader/anchor for the window.
  for (const arr of lapStartsByDriver.values()) if (arr.length > leaderLapStarts.length) leaderLapStarts = arr

  const lapOf = (dn: number, ms: number): number => {
    const arr = lapStartsByDriver.get(dn)
    if (!arr || !arr.length) return 1
    let lap = 1
    for (const e of arr) {
      if (ms >= e.ms) lap = e.lap
      else break
    }
    return lap
  }

  // Capture window: race start → start of (MAX_LAPS+1) on the anchor, else session end.
  const fromIso = session.date_start
  let toMs = Date.parse(session.date_end)
  if (Number.isFinite(MAX_LAPS)) {
    const boundary = leaderLapStarts.find((e) => e.lap === MAX_LAPS + 1)
    if (boundary) toMs = boundary.ms
  }
  const toIso = new Date(toMs).toISOString()

  const targetDrivers = drivers.filter((d) => !DRIVER_FILTER || DRIVER_FILTER.has(d.driver_number))

  const tracks: unknown[] = []
  const aggregates: Array<{ driverNumber: number; lap: number; avgSpeed: number; minGapToAheadM: number }> = []
  let bestOutline: { x: number[]; y: number[] } | null = null
  let bestOutlineLen = 0

  for (const d of targetDrivers) {
    let locs: OpenF1Location[] = []
    try {
      locs = await listLocations(SESSION_KEY, d.driver_number, fromIso, toIso)
    } catch (e) {
      console.warn(`[capture] #${d.driver_number} location fetch failed:`, e)
      continue
    }
    const reduced = downsampleByTime(locs, startMs)
    if (reduced.length < 50) {
      console.log(`[capture] #${d.driver_number} only ${reduced.length} frames — skipping`)
      continue
    }

    const t: number[] = []
    const x: number[] = []
    const y: number[] = []
    const lap: number[] = []
    const status: number[] = []
    for (const l of reduced) {
      const ms = Date.parse(l.date) - startMs
      if (ms < 0) continue
      t.push(ms)
      x.push(Math.round(l.x * 10) / 10)
      y.push(Math.round(l.y * 10) / 10)
      lap.push(Math.min(lapOf(d.driver_number, Date.parse(l.date)), Number.isFinite(MAX_LAPS) ? MAX_LAPS : 1e9))
      status.push(0)
    }
    if (t.length < 50) continue

    tracks.push({
      sessionKey: String(SESSION_KEY),
      circuitKey: String(session.circuit_key),
      driverNumber: d.driver_number,
      sampleRateHz: SAMPLE_HZ,
      frameCount: t.length,
      t0Ms: t[0],
      tEndMs: t[t.length - 1],
      frames: { t, x, y, lap, status },
    })

    // Outline: longest single-driver frame set (one clean lap worth of shape).
    if (x.length > bestOutlineLen) {
      bestOutlineLen = x.length
      bestOutline = { x, y }
    }

    // avg speed per lap = lap path length / lap_duration (km/h)
    const dur = lapDurByDriver.get(d.driver_number)
    const lapPts = new Map<number, OpenF1Location[]>()
    for (const l of reduced) {
      const ln = lapOf(d.driver_number, Date.parse(l.date))
      const a = lapPts.get(ln) ?? []
      a.push(l)
      lapPts.set(ln, a)
    }
    for (const [ln, pts] of lapPts) {
      const ld = dur?.get(ln)
      if (!ld || pts.length < 2) continue
      let dist = 0
      for (let i = 1; i < pts.length; i++) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
      aggregates.push({
        driverNumber: d.driver_number,
        lap: ln,
        avgSpeed: Math.round((dist / ld) * 3.6 * 10) / 10,
        minGapToAheadM: 1e9, // gap-to-ahead not computed in capture v1
      })
    }
  }

  // Downsample the chosen outline to ~600 points.
  let outline = { x: [] as number[], y: [] as number[] }
  if (bestOutline) {
    const N = 600
    const step = Math.max(1, Math.floor(bestOutline.x.length / N))
    for (let i = 0; i < bestOutline.x.length; i += step) {
      outline.x.push(bestOutline.x[i])
      outline.y.push(bestOutline.y[i])
    }
  }
  const bounds = outline.x.length
    ? {
        minX: Math.min(...outline.x),
        maxX: Math.max(...outline.x),
        minY: Math.min(...outline.y),
        maxY: Math.max(...outline.y),
      }
    : null

  const fixture = {
    session: {
      sessionKey: String(SESSION_KEY),
      sessionName: 'Race',
      circuitName: session.circuit_short_name,
      country: session.country_name,
      year: session.year,
      circuitKey: String(session.circuit_key),
      drivers: targetDrivers.map((d, i) => ({
        driverNumber: d.driver_number,
        fullName: d.full_name,
        abbreviation: d.name_acronym,
        teamName: d.team_name,
        teamColour: d.team_colour ? `#${d.team_colour}` : '#888888',
        championshipPosition: i + 1, // capture has no standings context; placeholder
      })),
    },
    circuit: {
      circuitKey: String(session.circuit_key),
      year: session.year,
      gpName: session.circuit_short_name,
      circuitName: session.circuit_short_name,
      country: session.country_name,
      rotationDeg: 0,
      corners: [],
      outline,
      bounds,
      sectorBoundaries: null,
    },
    tracks,
    aggregates,
    sectorBests: null,
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(fixture))
  const frames = (tracks as Array<{ frameCount: number }>).reduce((n, t) => n + t.frameCount, 0)
  console.log(
    `[capture] wrote ${OUT}\n  drivers=${tracks.length} frames=${frames} sizeKB≈${Math.round(
      JSON.stringify(fixture).length / 1024,
    )}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e)
    process.exit(1)
  })
