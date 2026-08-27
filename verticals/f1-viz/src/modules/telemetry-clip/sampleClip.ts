import type {
  TelemetryClipPayload,
  TelemetryClipTrace,
  TelemetryClipTrack,
} from '../../web/clip/clipSource'

/**
 * Compact synthetic clip payload for the catalog preview — a 2-car, 2-lap chase
 * round a simple oval. Deterministic (index-based math, no RNG) so it serializes
 * stably. Not realistic telemetry; just enough shape for the player to animate.
 */

const A = 8000
const B = 5000
const LAP_MS = 60_000
const POS_HZ = 4
const TEL_HZ = 20
const LAPS = 2

interface DriverSeed {
  driverNumber: number
  abbreviation: string
  fullName: string
  teamName: string
  teamColour: string
  /** Phase offset (rad) so the cars are spaced on track. */
  phase: number
  /** Lap-time multiplier. */
  pace: number
}

const SEEDS: DriverSeed[] = [
  { driverNumber: 1, abbreviation: 'VER', fullName: 'Max Verstappen', teamName: 'Red Bull', teamColour: '#3671C6', phase: 0, pace: 1.0 },
  { driverNumber: 16, abbreviation: 'LEC', fullName: 'Charles Leclerc', teamName: 'Ferrari', teamColour: '#E8002D', phase: 0.18, pace: 1.02 },
]

function ovalPoint(theta: number): [number, number] {
  return [A * Math.cos(theta), B * Math.sin(theta)]
}

function buildTrack(seed: DriverSeed): TelemetryClipTrack {
  const lapMs = LAP_MS * seed.pace
  const stepMs = 1000 / POS_HZ
  const total = Math.round((lapMs * LAPS) / stepMs)
  const t: number[] = []
  const x: number[] = []
  const y: number[] = []
  const lap: number[] = []
  const status: number[] = []
  for (let i = 0; i <= total; i++) {
    const ms = i * stepMs
    const frac = (ms / lapMs) % 1
    const theta = seed.phase + frac * Math.PI * 2
    const [px, py] = ovalPoint(theta)
    t.push(Math.round(ms))
    x.push(Math.round(px))
    y.push(Math.round(py))
    lap.push(Math.floor(ms / lapMs) + 1)
    status.push(0)
  }
  return {
    driverNumber: seed.driverNumber,
    sampleRateHz: POS_HZ,
    frameCount: t.length,
    t0Ms: t[0],
    tEndMs: t[t.length - 1],
    frames: { t, x, y, lap, status },
  }
}

function buildTraces(seed: DriverSeed): TelemetryClipTrace[] {
  const lapMs = LAP_MS * seed.pace
  const stepS = 1 / TEL_HZ
  const out: TelemetryClipTrace[] = []
  for (let lapIdx = 0; lapIdx < LAPS; lapIdx++) {
    const sessionTime: number[] = []
    const speed: number[] = []
    const throttle: number[] = []
    const brake: number[] = []
    const nGear: number[] = []
    const distance: number[] = []
    const lapStartS = (lapIdx * lapMs) / 1000
    const n = Math.round(lapMs / 1000 / stepS)
    for (let i = 0; i <= n; i++) {
      const frac = i / n
      sessionTime.push(Number((lapStartS + frac * (lapMs / 1000)).toFixed(3)))
      // Two "straights" per lap → speed peaks; corners → braking.
      const corner = (Math.sin(frac * Math.PI * 4) + 1) / 2 // 0..1
      const spd = 320 - corner * 150
      speed.push(Math.round(spd))
      throttle.push(Math.round((1 - corner) * 100))
      brake.push(corner > 0.7 ? 1 : 0)
      nGear.push(Math.max(1, Math.min(8, Math.round(spd / 45))))
      distance.push(Math.round(frac * 5000))
    }
    out.push({
      driverNumber: seed.driverNumber,
      lap: lapIdx + 1,
      frameCount: sessionTime.length,
      sampleRateHz: TEL_HZ,
      sessionTime,
      distance,
      speed,
      throttle,
      brake,
      nGear,
    })
  }
  return out
}

function buildOutline(): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i <= 80; i++) {
    const [px, py] = ovalPoint((i / 80) * Math.PI * 2)
    x.push(Math.round(px))
    y.push(Math.round(py))
  }
  return { x, y }
}

export function buildSampleClip(): TelemetryClipPayload {
  const outline = buildOutline()
  return {
    sessionKey: 'sample',
    circuitKey: 'sample',
    circuitName: 'Sample Circuit',
    year: 2024,
    lapFrom: 1,
    lapTo: LAPS,
    channels: ['speed', 'throttle', 'brake', 'nGear'],
    drivers: SEEDS.map((s) => ({
      driverNumber: s.driverNumber,
      abbreviation: s.abbreviation,
      fullName: s.fullName,
      teamName: s.teamName,
      teamColour: s.teamColour,
    })),
    circuit: {
      circuitKey: 'sample',
      year: 2024,
      gpName: 'Sample Grand Prix',
      circuitName: 'Sample Circuit',
      country: 'Testland',
      rotationDeg: 0,
      corners: [],
      outline,
      bounds: { minX: -A, maxX: A, minY: -B, maxY: B },
      sectorBoundaries: { index1: 20, index2: 53 },
    },
    lapsByDriver: Object.fromEntries(
      SEEDS.map((s) => [
        s.driverNumber,
        Array.from({ length: LAPS }, (_, i) => ({
          driverNumber: s.driverNumber,
          lap: i + 1,
          lapTimeSec: Number(((LAP_MS * s.pace) / 1000).toFixed(3)),
          sectors: [28.1, 30.4, Number(((LAP_MS * s.pace) / 1000 - 58.5).toFixed(3))],
          compound: 'MEDIUM',
          stintLap: i + 1,
        })),
      ]),
    ),
    sectorBests: Object.fromEntries(
      SEEDS.map((s) => [
        s.driverNumber,
        { s1: 28.1, s2: 30.4, s3: Number(((LAP_MS * s.pace) / 1000 - 58.5).toFixed(3)), s1Lap: 1, s2Lap: 1, s3Lap: 1 },
      ]),
    ),
    tracks: SEEDS.map(buildTrack),
    telemetry: SEEDS.flatMap(buildTraces),
  }
}
