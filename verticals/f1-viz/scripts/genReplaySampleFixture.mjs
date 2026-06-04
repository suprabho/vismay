/**
 * Generates a COMPACT, deterministic synthetic race-replay fixture for the
 * `f1:race-replay` module sample. Trimmed vs. the vizf1 worker generator
 * (5 drivers · 2 laps · ~1 Hz · smaller loop) so it inlines into a .ts sample —
 * the catalog/SSG render it with zero network dependency.
 *
 * Run:  node verticals/f1-viz/scripts/genReplaySampleFixture.mjs
 * Out:  verticals/f1-viz/src/modules/race-replay/sampleFixture.ts
 *
 * Shape matches `ReplayFixture` in ../src/web/replay/dataSource.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../src/modules/race-replay/sampleFixture.ts')

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
const BASE_R = 300 // small loop → ~2.1 km lap (~38 s) keeps the sample tiny
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
  const theta = s * TWO_PI
  const r = radius(theta)
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) }
}

const PATH_N = 2000
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
const LAP_LENGTH = totalLen

function posAt(distance) {
  let d = ((distance % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH
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

// Downsampled outline for rendering (kept small — this is a sample).
const OUTLINE_N = 220
const outlineX = []
const outlineY = []
for (let i = 0; i < OUTLINE_N; i++) {
  const p = curvePoint(i / OUTLINE_N)
  outlineX.push(Math.round(p.x))
  outlineY.push(Math.round(p.y))
}
const bounds = {
  minX: Math.min(...outlineX),
  maxX: Math.max(...outlineX),
  minY: Math.min(...outlineY),
  maxY: Math.max(...outlineY),
}

// ── drivers (compact 5-car grid) ────────────────────────────────────────────
const DRIVERS = [
  { driverNumber: 81, abbreviation: 'PIA', fullName: 'Oscar Piastri', teamName: 'McLaren', teamId: 'mclaren', teamColour: '#FF8000', skill: 0.997 },
  { driverNumber: 4, abbreviation: 'NOR', fullName: 'Lando Norris', teamName: 'McLaren', teamId: 'mclaren', teamColour: '#FF8000', skill: 0.99 },
  { driverNumber: 16, abbreviation: 'LEC', fullName: 'Charles Leclerc', teamName: 'Ferrari', teamId: 'ferrari', teamColour: '#E8002D', skill: 0.992 },
  { driverNumber: 1, abbreviation: 'VER', fullName: 'Max Verstappen', teamName: 'Red Bull Racing', teamId: 'red_bull', teamColour: '#3671C6', skill: 0.985 },
  { driverNumber: 44, abbreviation: 'HAM', fullName: 'Lewis Hamilton', teamName: 'Mercedes', teamId: 'mercedes', teamColour: '#27F4D2', skill: 1.0 },
]

const TOTAL_LAPS = 2
const DT_MS = 1000 // 1 Hz
const SAMPLE_HZ = 1000 / DT_MS
const BASE_LAP_S = LAP_LENGTH / 56

function lapTimeFor(skill, lap) {
  const noise = (rand() - 0.5) * 2 * 0.012
  const warmup = lap === 1 ? 1.04 : 1.0
  return BASE_LAP_S * skill * warmup * (1 + noise)
}

const tracks = []
const aggregates = []
const startOffset = (i) => -i * (LAP_LENGTH * 0.006)
const laneOffset = (i) => (i - (DRIVERS.length - 1) / 2) * 6

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

  const t = []
  const x = []
  const y = []
  const lapArr = []
  const status = []

  const lane = laneOffset(di)
  const off0 = startOffset(di)

  for (let ms = 0; ms <= totalS * 1000; ms += DT_MS) {
    const sec = ms / 1000
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
    const nx = -p.ty
    const ny = p.tx
    t.push(ms)
    x.push(Math.round(p.x + nx * lane))
    y.push(Math.round(p.y + ny * lane))
    lapArr.push(lap)
    status.push(0)
  }

  tracks.push({
    sessionKey: 'sample',
    circuitKey: 'sample-circuit',
    driverNumber: d.driverNumber,
    sampleRateHz: SAMPLE_HZ,
    frameCount: t.length,
    t0Ms: 0,
    tEndMs: t[t.length - 1],
    frames: { t, x, y, lap: lapArr, status },
  })

  for (let l = 1; l <= TOTAL_LAPS; l++) {
    const avgSpeed = (LAP_LENGTH / lapTimes[l - 1]) * 3.6
    aggregates.push({
      driverNumber: d.driverNumber,
      lap: l,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      minGapToAheadM: 0,
    })
  }
})

// gap-to-ahead per lap from end-of-lap positions
const aggByKey = new Map(aggregates.map((a) => [`${a.driverNumber}:${a.lap}`, a]))
for (let l = 1; l <= TOTAL_LAPS; l++) {
  const cum = DRIVERS.map((d, di) => {
    const trk = tracks[di]
    let lastIdx = -1
    for (let i = 0; i < trk.frames.lap.length; i++) if (trk.frames.lap[i] === l) lastIdx = i
    const px = lastIdx >= 0 ? trk.frames.x[lastIdx] : 0
    const py = lastIdx >= 0 ? trk.frames.y[lastIdx] : 0
    return { dn: d.driverNumber, dist: l * LAP_LENGTH + startOffset(di), px, py }
  })
  cum.sort((a, b) => b.dist - a.dist)
  cum.forEach((c, rank) => {
    const agg = aggByKey.get(`${c.dn}:${l}`)
    if (!agg) return
    if (rank === 0) agg.minGapToAheadM = 1e9 // leader sentinel (JSON can't hold Infinity)
    else {
      const ahead = cum[rank - 1]
      agg.minGapToAheadM = Math.round(Math.hypot(ahead.px - c.px, ahead.py - c.py))
    }
  })
}

const champOrder = [...DRIVERS].sort((a, b) => a.skill - b.skill)
const champPos = new Map(champOrder.map((d, i) => [d.driverNumber, i + 1]))

const fixture = {
  session: {
    sessionKey: 'sample',
    sessionName: 'Race (sample)',
    circuitName: 'Vismay Demo Circuit',
    country: 'Synthetic',
    year: 2026,
    circuitKey: 'sample-circuit',
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
    circuitKey: 'sample-circuit',
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

const banner =
  '// AUTO-GENERATED by scripts/genReplaySampleFixture.mjs — do not edit by hand.\n' +
  '// Compact synthetic telemetry (5 cars · 2 laps · 1 Hz) for the f1:race-replay sample.\n'
const body =
  `import type { ReplayFixture } from '../../web/replay/dataSource'\n\n` +
  `export const sampleFixture: ReplayFixture = ${JSON.stringify(fixture)}\n`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, banner + body)
const frames = tracks.reduce((n, t) => n + t.frameCount, 0)
console.log(
  `wrote ${OUT}\n  drivers=${DRIVERS.length} laps=${TOTAL_LAPS} lapLen=${Math.round(LAP_LENGTH)}m ` +
    `frames=${frames} sizeKB≈${Math.round((banner + body).length / 1024)}`,
)
