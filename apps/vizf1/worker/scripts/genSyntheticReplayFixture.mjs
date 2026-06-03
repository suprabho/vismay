/**
 * Generates a deterministic, realistic-looking SYNTHETIC race-replay fixture so
 * the replay UI is runnable with zero network/DB dependency.
 *
 * This is NOT real telemetry — the car motion is simulated on a procedurally
 * generated closed-loop circuit. Replace with real OpenF1 data via
 * `captureReplayFixture.ts` when you want a true race.
 *
 * Run:  node apps/vizf1/worker/scripts/genSyntheticReplayFixture.mjs
 * Out:  apps/vizf1/web/public/fixtures/replay-demo.json
 *
 * Shape matches `ReplayFixture` in apps/vizf1/web/lib/replay/dataSource.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// scripts → worker → vizf1 → apps → repo root, then into the web app's public dir.
const OUT = resolve(__dirname, '../../../../apps/vizf1/web/public/fixtures/replay-demo.json')

// ── deterministic PRNG (mulberry32) ─────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260604)

// ── circuit: procedural smooth closed loop (meters) ─────────────────────────
const TWO_PI = Math.PI * 2
// ~630 → a ~4.5 km lap (≈80 s at 56 m/s), realistic F1 proportions.
const BASE_R = 630
function radius(theta) {
  return (
    BASE_R *
    (1 +
      0.34 * Math.sin(theta) +
      0.18 * Math.sin(2 * theta + 0.8) +
      0.12 * Math.sin(3 * theta + 2.1) -
      0.08 * Math.cos(5 * theta))
  )
}
function curvePoint(s) {
  // s in [0,1) → angle around the loop
  const theta = s * TWO_PI
  const r = radius(theta)
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) }
}

// Fine path with cumulative arc-length for car positioning.
const PATH_N = 3000
const path = []
let totalLen = 0
let prev = curvePoint(0)
path.push({ ...prev, len: 0 })
for (let i = 1; i <= PATH_N; i++) {
  const p = curvePoint(i / PATH_N)
  totalLen += Math.hypot(p.x - prev.x, p.y - prev.y)
  path.push({ ...p, len: totalLen })
  prev = p
}
const LAP_LENGTH = totalLen // meters

/** Position + unit tangent at a given distance along the lap. */
function posAt(distance) {
  let d = ((distance % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH
  // binary search the cumulative-length array
  let lo = 0
  let hi = path.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (path[mid].len <= d) lo = mid
    else hi = mid
  }
  const a = path[lo]
  const b = path[lo + 1] ?? path[0]
  const span = b.len - a.len || 1
  const u = (d - a.len) / span
  const x = a.x + (b.x - a.x) * u
  const y = a.y + (b.y - a.y) * u
  let tx = b.x - a.x
  let ty = b.y - a.y
  const tl = Math.hypot(tx, ty) || 1
  tx /= tl
  ty /= tl
  return { x, y, tx, ty }
}

// Downsampled outline for rendering.
const OUTLINE_N = 600
const outlineX = []
const outlineY = []
for (let i = 0; i < OUTLINE_N; i++) {
  const p = curvePoint(i / OUTLINE_N)
  outlineX.push(Math.round(p.x * 10) / 10)
  outlineY.push(Math.round(p.y * 10) / 10)
}
const bounds = {
  minX: Math.min(...outlineX),
  maxX: Math.max(...outlineX),
  minY: Math.min(...outlineY),
  maxY: Math.max(...outlineY),
}

// ── drivers (2024-ish grid sample) ──────────────────────────────────────────
const DRIVERS = [
  { driverNumber: 1, abbreviation: 'VER', fullName: 'Max Verstappen', teamName: 'Red Bull Racing', teamId: 'red_bull', teamColour: '#3671C6', skill: 0.985 },
  { driverNumber: 4, abbreviation: 'NOR', fullName: 'Lando Norris', teamName: 'McLaren', teamId: 'mclaren', teamColour: '#FF8000', skill: 0.99 },
  { driverNumber: 16, abbreviation: 'LEC', fullName: 'Charles Leclerc', teamName: 'Ferrari', teamId: 'ferrari', teamColour: '#E8002D', skill: 0.992 },
  { driverNumber: 81, abbreviation: 'PIA', fullName: 'Oscar Piastri', teamName: 'McLaren', teamId: 'mclaren', teamColour: '#FF8000', skill: 0.997 },
  { driverNumber: 44, abbreviation: 'HAM', fullName: 'Lewis Hamilton', teamName: 'Mercedes', teamId: 'mercedes', teamColour: '#27F4D2', skill: 1.0 },
  { driverNumber: 63, abbreviation: 'RUS', fullName: 'George Russell', teamName: 'Mercedes', teamId: 'mercedes', teamColour: '#27F4D2', skill: 1.003 },
  { driverNumber: 55, abbreviation: 'SAI', fullName: 'Carlos Sainz', teamName: 'Ferrari', teamId: 'ferrari', teamColour: '#E8002D', skill: 1.006 },
  { driverNumber: 14, abbreviation: 'ALO', fullName: 'Fernando Alonso', teamName: 'Aston Martin', teamId: 'aston_martin', teamColour: '#229971', skill: 1.012 },
]

const TOTAL_LAPS = 10
const DT_MS = 500 // 2 Hz
const SAMPLE_HZ = 1000 / DT_MS
const BASE_LAP_S = LAP_LENGTH / 56 // ~56 m/s avg → believable lap time

// Per-driver per-lap lap time (seconds), with skill + deterministic noise.
function lapTimeFor(skill, lap) {
  const noise = (rand() - 0.5) * 2 * 0.012 // ±1.2%
  const warmup = lap === 1 ? 1.04 : 1.0 // slower opening lap
  return BASE_LAP_S * skill * warmup * (1 + noise)
}

const tracks = []
const aggregates = []
// grid spread: P1 starts slightly ahead along the track
const startOffset = (i) => -i * (LAP_LENGTH * 0.0035)
// lane offset so dots don't perfectly overlap on the racing line
const laneOffset = (i) => (i - (DRIVERS.length - 1) / 2) * 6

let globalMaxT = 0

DRIVERS.forEach((d, di) => {
  const lapTimes = []
  for (let l = 1; l <= TOTAL_LAPS; l++) lapTimes.push(lapTimeFor(d.skill, l))
  const lapCumEndS = []
  let acc = 0
  for (const lt of lapTimes) {
    acc += lt
    lapCumEndS.push(acc)
  }
  const totalS = acc
  globalMaxT = Math.max(globalMaxT, totalS * 1000)

  const t = []
  const x = []
  const y = []
  const lapArr = []
  const status = []

  const lane = laneOffset(di)
  const off0 = startOffset(di)

  for (let ms = 0; ms <= totalS * 1000; ms += DT_MS) {
    const sec = ms / 1000
    // which lap + elapsed-in-lap
    let lap = 1
    let lapStartS = 0
    for (let l = 0; l < lapCumEndS.length; l++) {
      if (sec < lapCumEndS[l]) {
        lap = l + 1
        lapStartS = l === 0 ? 0 : lapCumEndS[l - 1]
        break
      }
      lap = l + 1
      lapStartS = l === 0 ? 0 : lapCumEndS[l - 1]
    }
    const lt = lapTimes[lap - 1]
    const elapsedInLap = sec - lapStartS
    const lapFrac = Math.min(1, elapsedInLap / lt)
    const distance = off0 + (lap - 1) * LAP_LENGTH + lapFrac * LAP_LENGTH
    const p = posAt(distance)
    // apply perpendicular lane offset (normal = rotate tangent 90°)
    const nx = -p.ty
    const ny = p.tx
    t.push(ms)
    x.push(Math.round((p.x + nx * lane) * 10) / 10)
    y.push(Math.round((p.y + ny * lane) * 10) / 10)
    lapArr.push(lap)
    status.push(0)
  }

  tracks.push({
    sessionKey: 'demo',
    circuitKey: 'demo-circuit',
    driverNumber: d.driverNumber,
    sampleRateHz: SAMPLE_HZ,
    frameCount: t.length,
    t0Ms: 0,
    tEndMs: t[t.length - 1],
    frames: { t, x, y, lap: lapArr, status },
  })

  // per-lap aggregates: avg speed (km/h) from this lap's time
  for (let l = 1; l <= TOTAL_LAPS; l++) {
    const avgSpeed = (LAP_LENGTH / lapTimes[l - 1]) * 3.6
    aggregates.push({
      driverNumber: d.driverNumber,
      lap: l,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      minGapToAheadM: 0, // filled below
    })
  }
})

// Compute gap-to-ahead per lap from cumulative distance at each lap end.
const aggByKey = new Map(aggregates.map((a) => [`${a.driverNumber}:${a.lap}`, a]))
for (let l = 1; l <= TOTAL_LAPS; l++) {
  const cum = DRIVERS.map((d, di) => {
    const trk = tracks[di]
    // cumulative distance at end of lap l ≈ frames where lap === l (last)
    let lastIdx = -1
    for (let i = 0; i < trk.frames.lap.length; i++) if (trk.frames.lap[i] === l) lastIdx = i
    const px = lastIdx >= 0 ? trk.frames.x[lastIdx] : 0
    const py = lastIdx >= 0 ? trk.frames.y[lastIdx] : 0
    return { di, dn: d.driverNumber, dist: l * LAP_LENGTH + startOffset(di), px, py }
  })
  cum.sort((a, b) => b.dist - a.dist)
  cum.forEach((c, rank) => {
    const agg = aggByKey.get(`${c.dn}:${l}`)
    if (!agg) return
    if (rank === 0) {
      agg.minGapToAheadM = Infinity // leader → card shows "—"
    } else {
      const ahead = cum[rank - 1]
      agg.minGapToAheadM = Math.round(Math.hypot(ahead.px - c.px, ahead.py - c.py))
    }
  })
}
// JSON can't carry Infinity — sentinel the leader's gap to a large number the UI treats as "no car ahead".
for (const a of aggregates) if (!Number.isFinite(a.minGapToAheadM)) a.minGapToAheadM = 1e9

// championship order = skill order (best skill = P1)
const champOrder = [...DRIVERS].sort((a, b) => a.skill - b.skill)
const champPos = new Map(champOrder.map((d, i) => [d.driverNumber, i + 1]))

const fixture = {
  session: {
    sessionKey: 'demo',
    sessionName: 'Race (sample)',
    circuitName: 'Vismay Demo Circuit',
    country: 'Synthetic',
    year: 2026,
    circuitKey: 'demo-circuit',
    drivers: DRIVERS.map((d) => ({
      driverNumber: d.driverNumber,
      fullName: d.fullName,
      abbreviation: d.abbreviation,
      teamName: d.teamName,
      teamId: d.teamId,
      teamColour: d.teamColour,
      championshipPosition: champPos.get(d.driverNumber) ?? null,
    })),
  },
  circuit: {
    circuitKey: 'demo-circuit',
    year: 2026,
    gpName: 'Vismay Demo Grand Prix',
    circuitName: 'Vismay Demo Circuit',
    country: 'Synthetic',
    rotationDeg: 0,
    corners: [],
    outline: { x: outlineX, y: outlineY },
    bounds,
    sectorBoundaries: null,
  },
  tracks,
  aggregates,
  sectorBests: null,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(fixture))
const frames = tracks.reduce((n, t) => n + t.frameCount, 0)
console.log(
  `wrote ${OUT}\n  drivers=${DRIVERS.length} laps=${TOTAL_LAPS} lapLen=${Math.round(LAP_LENGTH)}m ` +
    `frames=${frames} sizeKB≈${Math.round(JSON.stringify(fixture).length / 1024)}`,
)
