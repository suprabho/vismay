import assert from 'node:assert/strict'
import test from 'node:test'
import type { RaceEvents } from '@vismay/f1-viz/web'
import { buildLapChartSpec, driverSeries, type LapRow } from './lapChart'

const drivers = [
  { number: 1, abbr: 'VER', name: 'Max Verstappen', teamColour: '#3671C6' },
  { number: 6, abbr: 'HAD', name: 'Isack Hadjar', teamColour: '#3671C6' },
  { number: 63, abbr: 'RUS', name: 'George Russell', teamColour: '#27F4D2' },
]

function lap(driver: number, n: number, sec: number | null, extra: Partial<LapRow> = {}): LapRow {
  return {
    driver_number: driver,
    lap: n,
    lap_time_sec: sec,
    sectors: null,
    compound: 'MEDIUM',
    tyre_life: n,
    position: driver === 1 ? 1 : 2,
    events: [],
    avg_speed: null,
    max_speed: 320,
    avg_throttle_pct: null,
    braking_events: null,
    drs_activations: null,
    avg_gap_to_ahead_m: null,
    ...extra,
  }
}

// 10 laps: lap 1 start, SC on 5-6 (slow), VER pits on lap 8 (in) → 9 (out), a 7% outlier on lap 3 for RUS.
const rows: LapRow[] = []
for (let n = 1; n <= 10; n++) {
  const base = n === 1 ? 98 : n === 5 || n === 6 ? 130 : 90 + n * 0.05
  rows.push(lap(1, n, n === 8 ? 110 : n === 9 ? 108 : base, n === 8 ? { events: ['pit_in'] } : {}))
  rows.push(lap(63, n, n === 3 ? 99 : base + 0.4))
}
const events: RaceEvents = {
  source: 'openf1',
  periods: [{ kind: 'SC', startLap: 5, endLap: 6 }],
  pitStops: [{ driverNumber: 1, lap: 8, laneSec: 21.9, stopSec: 2.4 }],
}
const opts = { metric: 'lapTime' as const, hideSlowLaps: true, showKinds: new Set(['SC' as const]), showPits: true }

test('slow-lap filter drops start, SC, in/out laps and pace outliers; axis fits the racing laps', () => {
  const { spec, hidden } = buildLapChartSpec('k', rows, drivers, [1, 63], events, { driverNumber: 1, lap: 2 }, opts)
  assert.ok(spec)
  const at = (n: number) => spec.dataPoints.find((r) => r.lap === n)!
  for (const n of [1, 5, 6, 8, 9]) assert.equal(at(n).drv1, undefined, `VER lap ${n} hidden`)
  assert.equal(at(3).drv63, undefined, 'RUS outlier hidden')
  assert.equal(at(2).drv1, 90.1)
  // Lap 1/5/6 for both, lap 8/9 for VER, lap 3 for RUS.
  assert.equal(hidden, 9)
  // No fixed domain: the chart fits the (filtered) racing laps itself.
  assert.equal(spec.yAxis!.domain, undefined)
  const shown = spec.dataPoints.flatMap((r) => [r.drv1, r.drv63]).filter((v): v is number => typeof v === 'number')
  assert.ok(Math.max(...shown) < 92, 'no slow lap left to stretch the axis')
  assert.equal(spec.yAxis!.format, 'laptime')
  // Every lap has a row, so hidden laps break the line instead of bridging it.
  assert.equal(spec.dataPoints.length, 10)
})

test('event bands, fastest line and pit marker overlays', () => {
  const { spec } = buildLapChartSpec('k', rows, drivers, [1, 63], events, { driverNumber: 1, lap: 2 }, opts)
  const band = spec!.annotations!.find((a) => a.type === 'band')!
  assert.deepEqual(band.xRange, [4.5, 6.5])
  assert.equal(band.label, 'SC')
  assert.ok(spec!.annotations!.some((a) => a.type === 'line' && a.xValue === 2))
  const pit = spec!.annotations!.find((a) => a.type === 'point')!
  assert.equal(pit.xValue, 8)
  assert.equal(pit.label, '2.4s')
  // The in-lap is filtered out, so the marker pins to the lowest visible value.
  const shown = spec!.dataPoints.flatMap((r) => [r.drv1, r.drv63]).filter((v): v is number => typeof v === 'number')
  assert.equal(pit.yValue, Math.min(...shown))

  const unfiltered = buildLapChartSpec('k', rows, drivers, [1, 63], events, null, { ...opts, hideSlowLaps: false })
  assert.equal(unfiltered.hidden, 0)
  assert.equal(unfiltered.spec!.annotations!.find((a) => a.type === 'point')!.yValue, 110)
})

test('position is never filtered and plots P1 on top', () => {
  const { spec, hidden } = buildLapChartSpec('k', rows, drivers, [1, 63], events, null, { ...opts, metric: 'position' })
  assert.equal(hidden, 0)
  assert.equal(spec!.yAxis!.inverse, true)
  assert.equal(spec!.yAxis!.domain![0], 1)
})

test('a second car in the same team colour is dashed', () => {
  const series = driverSeries(drivers, [1, 6, 63])
  assert.equal(series[0].strokeDash, undefined)
  assert.ok(series[1].strokeDash)
  assert.equal(series[2].strokeDash, undefined)
})
