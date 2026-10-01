import {
  RACE_EVENT_STYLE,
  formatPitTime,
  type GraphAnnotation,
  type GraphSeries,
  type GraphSpec,
  type RaceEventKind,
  type RaceEvents,
} from '@vismay/f1-viz/web'
import type { TelemetryDriver } from './useTelemetrySession'

/** One `vizf1_telemetry_laps` row, as the Telemetry tab reads it. */
export interface LapRow {
  driver_number: number
  lap: number
  lap_time_sec: number | null
  sectors: Array<number | null> | null
  compound: string | null
  tyre_life: number | null
  position: number | null
  events: string[] | null
  avg_speed: number | null
  /** Per-lap aggregate — non-null exactly when channel telemetry was ingested. */
  max_speed: number | null
  avg_throttle_pct: number | null
  braking_events: number | null
  drs_activations: number | null
  avg_gap_to_ahead_m: number | null
}

export type LapMetric =
  | 'lapTime'
  | 's1'
  | 's2'
  | 's3'
  | 'position'
  | 'maxSpeed'
  | 'avgSpeed'
  | 'throttle'
  | 'gapAhead'
  | 'drs'
  | 'braking'

interface MetricDef {
  label: string
  axis: string
  unit: string
  format?: 'laptime' | 'integer'
  /** Pace metric: slow-lap filter also drops outliers vs the driver's median. */
  pace?: boolean
  inverse?: boolean
  /** Raw lap flags (lap 1, pits, SC) don't distort it — never filtered. */
  unfiltered?: boolean
  value: (r: LapRow) => number | null
}

const sector = (i: number) => (r: LapRow) => {
  const v = r.sectors?.[i]
  return v != null && v > 0 ? v : null
}

export const LAP_METRICS: Record<LapMetric, MetricDef> = {
  lapTime: { label: 'Lap time', axis: 'Lap time', unit: 's', format: 'laptime', pace: true, value: (r) => (r.lap_time_sec && r.lap_time_sec > 0 ? r.lap_time_sec : null) },
  s1: { label: 'Sector 1', axis: 'S1', unit: 's', pace: true, value: sector(0) },
  s2: { label: 'Sector 2', axis: 'S2', unit: 's', pace: true, value: sector(1) },
  s3: { label: 'Sector 3', axis: 'S3', unit: 's', pace: true, value: sector(2) },
  position: { label: 'Position', axis: 'Position', unit: '', format: 'integer', inverse: true, unfiltered: true, value: (r) => r.position },
  maxSpeed: { label: 'Top speed', axis: 'Top speed', unit: 'km/h', value: (r) => r.max_speed },
  avgSpeed: { label: 'Avg speed', axis: 'Avg speed', unit: 'km/h', value: (r) => r.avg_speed },
  throttle: { label: 'Full throttle', axis: 'Avg throttle', unit: '%', value: (r) => r.avg_throttle_pct },
  gapAhead: { label: 'Gap ahead', axis: 'Avg gap to car ahead', unit: 'm', value: (r) => r.avg_gap_to_ahead_m },
  drs: { label: 'DRS', axis: 'DRS activations', unit: '', format: 'integer', value: (r) => r.drs_activations },
  braking: { label: 'Braking', axis: 'Braking zones', unit: '', format: 'integer', value: (r) => r.braking_events },
}

export interface LapChartOptions {
  metric: LapMetric
  /** Drop lap 1, in/out laps, neutralised laps and pace outliers. */
  hideSlowLaps: boolean
  /** Event kinds to draw as bands. */
  showKinds: Set<RaceEventKind>
  showPits: boolean
}

/** Slower than this × the driver's median clean lap = not a racing lap. */
const OUTLIER_RATIO = 1.07

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Laps that aren't representative racing laps for a driver: the standing start,
 * the in-lap and out-lap of each stop, and every lap under SC / VSC / red.
 */
function slowLapKeys(rows: LapRow[], events: RaceEvents | null): Set<string> {
  const out = new Set<string>()
  const neutral = (events?.periods ?? []).filter((p) => p.kind !== 'YELLOW')
  const pitLaps = new Set<string>()
  for (const r of rows) if (r.events?.includes('pit_in')) pitLaps.add(`${r.driver_number}:${r.lap}`)
  for (const p of events?.pitStops ?? []) pitLaps.add(`${p.driverNumber}:${p.lap}`)
  for (const r of rows) {
    const key = `${r.driver_number}:${r.lap}`
    if (
      r.lap === 1 ||
      pitLaps.has(key) ||
      pitLaps.has(`${r.driver_number}:${r.lap - 1}`) ||
      r.events?.includes('sc_deployed') ||
      neutral.some((p) => r.lap >= p.startLap && r.lap <= p.endLap)
    ) {
      out.add(key)
    }
  }
  return out
}

/** Selected-driver series, dashing a second car in an already-used team colour. */
export function driverSeries(drivers: TelemetryDriver[], selected: number[]): GraphSeries[] {
  const byNum = new Map(drivers.map((d) => [d.number, d]))
  const usedColours = new Set<string>()
  return selected.map((n) => {
    const d = byNum.get(n)
    const color = d?.teamColour ?? '#9ca3af'
    const teammate = usedColours.has(color.toLowerCase())
    usedColours.add(color.toLowerCase())
    return {
      id: `drv${n}`,
      label: d?.abbr ?? `#${n}`,
      driverNumber: n,
      color,
      dataKey: `drv${n}`,
      type: 'actual' as const,
      ...(teammate ? { strokeDash: '6 4' } : {}),
    }
  })
}

export interface LapChartResult {
  spec: GraphSpec | null
  /** Points dropped by the slow-lap filter (for the "n laps hidden" hint). */
  hidden: number
}

export function buildLapChartSpec(
  sessionKey: string,
  rows: LapRow[],
  drivers: TelemetryDriver[],
  selected: number[],
  events: RaceEvents | null,
  fastest: { driverNumber: number; lap: number } | null,
  opts: LapChartOptions,
): LapChartResult {
  const def = LAP_METRICS[opts.metric]
  const sel = new Set(selected)
  const mine = rows.filter((r) => sel.has(r.driver_number))
  const filterOn = opts.hideSlowLaps && !def.unfiltered
  const slow = filterOn ? slowLapKeys(mine, events) : new Set<string>()

  // Per-driver median of the clean values → pace-outlier cut.
  const cut = new Map<number, number>()
  if (filterOn && def.pace) {
    const clean = new Map<number, number[]>()
    for (const r of mine) {
      const v = def.value(r)
      if (v == null || slow.has(`${r.driver_number}:${r.lap}`)) continue
      const list = clean.get(r.driver_number) ?? []
      list.push(v)
      clean.set(r.driver_number, list)
    }
    for (const [dn, list] of clean) {
      const m = median(list)
      if (m != null) cut.set(dn, m * OUTLIER_RATIO)
    }
  }

  let hidden = 0
  let maxLap = 0
  let lo = Infinity
  let hi = -Infinity
  const byLap = new Map<number, Record<string, unknown>>()
  const valueAt = new Map<string, number>()
  for (const r of mine) {
    if (r.lap > maxLap) maxLap = r.lap
    const v = def.value(r)
    if (v == null) continue
    const key = `${r.driver_number}:${r.lap}`
    const limit = cut.get(r.driver_number)
    if (slow.has(key) || (limit != null && v > limit)) {
      hidden += 1
      continue
    }
    const row = byLap.get(r.lap) ?? { lap: r.lap }
    row[`drv${r.driver_number}`] = Number(v.toFixed(3))
    byLap.set(r.lap, row)
    valueAt.set(key, v)
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!byLap.size) return { spec: null, hidden }
  // Every lap gets a row so a filtered lap breaks the line instead of bridging it.
  for (let lap = 1; lap <= maxLap; lap++) if (!byLap.has(lap)) byLap.set(lap, { lap })
  const dataPoints = [...byLap.values()].sort((a, b) => (a.lap as number) - (b.lap as number))

  // Positions get a fixed P1-at-top axis; everything else lets the chart pick
  // nice bounds around the visible values (it no longer anchors at 0).
  const domain: [number, number] | undefined = def.inverse ? [1, Math.max(hi, 2)] : undefined
  // Pit markers for a hidden (filtered) lap sit on the lowest visible value.
  const floor = def.inverse ? Math.max(hi, 2) : lo

  const annotations: GraphAnnotation[] = []
  const periods = [...(events?.periods ?? [])].sort((a, b) => a.startLap - b.startLap)
  for (const p of periods) {
    if (!opts.showKinds.has(p.kind)) continue
    const style = RACE_EVENT_STYLE[p.kind]
    annotations.push({
      type: 'band',
      xRange: [p.startLap - 0.5, p.endLap + 0.5],
      color: style.color,
      label: p.kind === 'YELLOW' ? '' : style.short,
    })
  }
  if (opts.metric === 'lapTime' && fastest && sel.has(fastest.driverNumber)) {
    annotations.push({ type: 'line', xValue: fastest.lap, color: '#a855f7', label: 'Fastest' })
  }
  if (opts.showPits) {
    const series = driverSeries(drivers, selected)
    for (const stop of events?.pitStops ?? []) {
      const s = series.find((x) => x.driverNumber === stop.driverNumber)
      if (!s) continue
      annotations.push({
        type: 'point',
        xValue: stop.lap,
        yValue: valueAt.get(`${stop.driverNumber}:${stop.lap}`) ?? floor,
        color: s.color,
        label: formatPitTime(stop),
      })
    }
  }

  return {
    hidden,
    spec: {
      id: `lap-${opts.metric}-${sessionKey}`,
      type: 'multi_line',
      xAxis: { key: 'lap', label: 'Lap', unit: '' },
      yAxis: {
        key: opts.metric,
        label: def.axis,
        unit: def.unit,
        ...(domain ? { domain } : {}),
        ...(def.format ? { format: def.format } : {}),
        ...(def.inverse ? { inverse: true } : {}),
      },
      smooth: false,
      zoom: true,
      series: driverSeries(drivers, selected),
      dataPoints,
      annotations,
    },
  }
}
