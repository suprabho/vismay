/**
 * Signal detector checks (run: npx tsx verticals/f1-viz/src/telemetry/signals.test.ts)
 *
 * Synthetic 20-lap race, three cars, built to reproduce the ways the old brief
 * misread a race:
 *   1. a pit-out lap and the opening lap are never "pace drops";
 *   2. a safety-car window yields a pit-swing moment with before/after order;
 *   3. a lap where the whole field pits (red flag) is not a strategic stop;
 *   4. a quicker car sitting right behind a slower one is a "stuck behind" moment.
 */
import assert from 'node:assert'
import { analyseRace, deriveSignals, type LapRow, type StintRow } from './signals'

const drivers = [
  { driverNumber: 1, abbreviation: 'NOR' },
  { driverNumber: 12, abbreviation: 'ANT' },
  { driverNumber: 44, abbreviation: 'HAM' },
]

const laps: LapRow[] = []
const row = (dn: number, lap: number, t: number, pos: number, events: string[] = [], gap: number | null = 200): LapRow => ({
  driver_number: dn,
  lap,
  lap_time_sec: t,
  sectors: null,
  compound: 'HARD',
  min_gap_to_ahead_m: pos === 1 ? 0 : gap,
  avg_speed: null,
  position: pos,
  events,
})

for (let lap = 1; lap <= 20; lap++) {
  const sc = lap === 8 || lap === 9 ? ['sc_deployed'] : []
  const red = lap === 3 ? ['pit_in'] : []
  const base = lap === 1 ? 104 : sc.length ? 130 : 98
  // NOR leads until he pits a lap late under the SC (lap 9) and drops to P3.
  const norPos = lap < 10 ? 1 : 3
  const antPos = lap < 10 ? 2 : 1
  // HAM runs P2 from lap 10, within ~30m of leader ANT on laps 12-18.
  const hamPos = lap < 10 ? 3 : 2
  laps.push(row(1, lap, lap === 9 ? 135 : lap === 10 ? 126.5 : base + 0.2, norPos, [...sc, ...red, ...(lap === 9 ? ['pit_in'] : [])]))
  laps.push(row(12, lap, lap === 8 ? 134 : base, antPos, [...sc, ...red, ...(lap === 8 ? ['pit_in'] : [])]))
  laps.push(
    row(44, lap, lap >= 12 && lap <= 18 ? base + 0.6 : base + 0.1, hamPos, [...sc, ...red], lap >= 12 && lap <= 18 ? 30 : 200),
  )
}
// ANT is slower than HAM on laps 12-18, so HAM is the quicker car stuck behind.
for (const l of laps) if (l.driver_number === 12 && l.lap >= 12 && l.lap <= 18) l.lap_time_sec = 99.2

const stints: StintRow[] = [
  { driverNumber: 1, compound: 'MEDIUM', startLap: 1, endLap: 9, totalLaps: 9, pitInLap: 9, pitOutLap: 10, pitDeltaSec: 35.1, averageDegPerLap: 0.1 },
  { driverNumber: 1, compound: 'HARD', startLap: 10, endLap: 20, totalLaps: 11, pitInLap: null, pitOutLap: null, pitDeltaSec: null, averageDegPerLap: 0.1 },
  { driverNumber: 12, compound: 'MEDIUM', startLap: 1, endLap: 8, totalLaps: 8, pitInLap: 8, pitOutLap: 9, pitDeltaSec: 31.8, averageDegPerLap: 0.1 },
  { driverNumber: 12, compound: 'HARD', startLap: 9, endLap: 20, totalLaps: 12, pitInLap: null, pitOutLap: null, pitDeltaSec: null, averageDegPerLap: 0.1 },
]

const a = analyseRace(laps, stints)
assert.deepEqual(a.windows, [{ lapFrom: 8, lapTo: 9 }], 'one SC window, laps 8–9')
assert.deepEqual(a.redFlagLaps, [3], 'lap 3 (everyone pits) is a red flag')
assert.ok(!a.pitStops.some((p) => p.lap === 3), 'red-flag tyre changes are not pit stops')
console.log('✓ analysis: SC window, red flag, pit stops')

const sigs = deriveSignals(laps, stints, drivers, a)
const drops = sigs.filter((s) => s.kind === 'pace_drop')
assert.ok(
  !drops.some((s) => /lap (1|9|10)\b/.test(s.title)),
  `pit-out / opening laps flagged as pace drops: ${drops.map((d) => d.title).join('; ')}`,
)
console.log('✓ pace drops ignore the start, pit-in and pit-out laps')

const swing = sigs.find((s) => s.kind === 'neutralised_pit')
assert.ok(swing, 'SC pit swing detected')
assert.ok(/NOR \(P1\) pitted on lap 9 → P3/.test(swing!.detail), `swing detail: ${swing!.detail}`)
assert.ok(swing!.priority >= 0.9, 'a leader-changing SC swing ranks at the top')
console.log('✓ SC pit swing: who pitted when, and the order before → after')

const stuck = sigs.find((s) => s.kind === 'stuck_behind')
assert.ok(stuck, 'stuck-behind detected')
assert.deepEqual(stuck!.driverNumbers, [12, 44], 'HAM stuck behind ANT')
console.log('✓ stuck behind: the quicker car trapped behind a slower one')

console.log('\nALL SIGNAL CHECKS PASSED')
