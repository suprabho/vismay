/**
 * Score-margin series and the run that decided a game, from ESPN play-by-play.
 * Pure functions so they can be unit-tested without the network.
 */

/** One scoring event: game-clock position plus the running score. */
export type MarginPoint = {
  /** Seconds elapsed since tip-off (regulation quarters are 720s, OT 300s). */
  t: number
  period: number
  clock: string
  home: number
  away: number
}

export type Run = {
  /** Which side made the run. */
  side: 'home' | 'away'
  /** Points scored by the running side during the window. */
  for: number
  /** Points allowed during the window. */
  against: number
  startIndex: number
  endIndex: number
  /** Period of the run's first and last baskets. */
  period: number
  endPeriod: number
  fromClock: string
  toClock: string
}

const QUARTER = 720
const OVERTIME = 300

export function periodStart(period: number): number {
  return period <= 4 ? (period - 1) * QUARTER : 4 * QUARTER + (period - 5) * OVERTIME
}

export function periodLength(period: number): number {
  return period <= 4 ? QUARTER : OVERTIME
}

/** "8:30" or "45.2" → seconds remaining in the period. */
export function clockSeconds(clock: string): number {
  if (clock.includes(':')) {
    const [m, s] = clock.split(':').map(Number)
    return m * 60 + s
  }
  return Number(clock) || 0
}

export function elapsed(period: number, clock: string): number {
  return periodStart(period) + periodLength(period) - clockSeconds(clock)
}

/** Total length of a game that reached `periods` periods. */
export function gameLength(periods: number): number {
  return periodStart(Math.max(4, periods) + 1)
}

/** A run is a burst: no longer than ten minutes of game clock. */
export const RUN_WINDOW = 600

/**
 * The biggest scoring run: the stretch of at most `RUN_WINDOW` seconds where
 * one side's net points are largest, reported as "22–4". Only runs of at
 * least 8 net points count; ties go to the shorter stretch.
 */
export function biggestRun(points: MarginPoint[], window = RUN_WINDOW): Run | null {
  if (points.length < 2) return null
  let best: { side: 'home' | 'away'; net: number; i: number; j: number } | null = null
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length && points[j].t - points[i].t <= window; j++) {
      const homeNet = points[j].home - points[i].home - (points[j].away - points[i].away)
      const side = homeNet >= 0 ? 'home' : 'away'
      const net = Math.abs(homeNet)
      if (
        !best ||
        net > best.net ||
        (net === best.net && points[j].t - points[i].t < points[best.j].t - points[best.i].t)
      ) {
        best = { side, net, i, j }
      }
    }
  }
  if (!best || best.net < 8) return null
  const { side, i, j } = best
  const other = side === 'home' ? 'away' : 'home'
  return {
    side,
    for: points[j][side] - points[i][side],
    against: points[j][other] - points[i][other],
    startIndex: i,
    endIndex: j,
    period: points[i + 1].period,
    endPeriod: points[j].period,
    fromClock: points[i + 1].clock,
    toClock: points[j].clock,
  }
}

/** Largest lead each side held. */
export function maxLeads(points: MarginPoint[]): { home: number; away: number } {
  let home = 0
  let away = 0
  for (const p of points) {
    home = Math.max(home, p.home - p.away)
    away = Math.max(away, p.away - p.home)
  }
  return { home, away }
}

/**
 * SVG polyline points for the margin (home − away, or the reverse with
 * `perspective: 'away'`), scaled into a `width` × `height` box centred on zero.
 */
export function marginPath(
  points: MarginPoint[],
  {
    width,
    height,
    total,
    perspective = 'home',
    pad = 0,
    maxAbs,
  }: {
    width: number
    height: number
    total: number
    perspective?: 'home' | 'away'
    pad?: number
    maxAbs?: number
  },
): { coords: Array<[number, number]>; scale: number } {
  const sign = perspective === 'home' ? 1 : -1
  const peak = maxAbs ?? Math.max(5, ...points.map((p) => Math.abs(p.home - p.away)))
  const mid = height / 2
  const scale = (mid - pad) / peak
  const coords = points.map((p): [number, number] => [
    round((p.t / total) * width),
    round(mid - sign * (p.home - p.away) * scale),
  ])
  return { coords, scale }
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
