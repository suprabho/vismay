import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecap, formatLapTime, pickPass, type LapChannels, type RecapInputs, type RecapLapRow } from './buildRecap'
import type { BattleChapter, FinishChapter, PitSwingChapter, StartChapter } from './types'

/**
 * A synthetic race: each driver's lap times, and the order at the end of each
 * lap derived from cumulative time (so positions and gaps always agree).
 */
function race(opts: {
  grid: Record<string, number>
  /** Base lap time per driver (s). */
  pace: Record<string, number>
  laps: number
  /** Extra seconds on a lap, e.g. a pit stop: { NOR: { 10: 21 } }. */
  extra?: Record<string, Record<number, number>>
  pits?: Record<string, number[]>
  nullLaps?: Record<string, number[]>
}): RecapInputs {
  const codes = Object.keys(opts.grid)
  const num = (c: string) => codes.indexOf(c) + 1
  const cum: Record<string, number> = {}
  // Grid slots: each place back starts 0.25 s later.
  for (const c of codes) cum[c] = (opts.grid[c] - 1) * 0.25
  const laps: RecapLapRow[] = []
  for (let lap = 1; lap <= opts.laps; lap++) {
    const times: Record<string, number> = {}
    for (const c of codes) {
      times[c] = opts.pace[c] + (opts.extra?.[c]?.[lap] ?? 0)
      cum[c] += times[c]
    }
    const order = [...codes].sort((x, y) => cum[x] - cum[y])
    for (const c of codes) {
      laps.push({
        driver_number: num(c),
        lap,
        lap_time_sec: opts.nullLaps?.[c]?.includes(lap) ? null : Math.round(times[c] * 1000) / 1000,
        position: order.indexOf(c) + 1,
        events: opts.pits?.[c]?.includes(lap) ? ['pit_in'] : [],
      })
    }
  }
  const final = [...codes].sort((x, y) => cum[x] - cum[y])
  return {
    session: {
      session_key: 'test_R',
      season: 2026,
      round: 1,
      gp_name: 'Test Grand Prix',
      drivers: codes.map((c) => ({
        driverNumber: num(c),
        abbreviation: c,
        lastName: `${c[0]}${c.slice(1).toLowerCase()}`,
        teamName: `Team ${c}`,
        teamColour: '3671C6',
      })),
      session_results: final.map((c, i) => ({
        driverNumber: num(c),
        gridPosition: opts.grid[c],
        position: i + 1,
        points: [25, 18, 15, 12, 10, 8][i] ?? 0,
        status: 'Finished',
        timeSec: i === 0 ? cum[c] : cum[c] - cum[final[0]],
        laps: opts.laps,
      })),
    },
    laps,
    events: null,
    corners: [
      { number: 1, distance: 300 },
      { number: 4, distance: 1200 },
    ],
  }
}

const chapter = <K extends string>(r: ReturnType<typeof buildRecap>, kind: K) =>
  r.chapters.find((c) => c.kind === kind)

test('start: places gained on lap 1, pit-lane start counts from the back', () => {
  const r = buildRecap(
    race({
      grid: { VER: 1, NOR: 2, LEC: 3, ALO: 0 },
      pace: { VER: 80, NOR: 80.5, LEC: 80.6, ALO: 79 },
      laps: 3,
    }),
  )
  const start = chapter(r, 'start') as StartChapter
  assert.equal(r.chapters[0].kind, 'start')
  // ALO starts from the pit lane (counted as P4, 0.75 s back) and is 1 s a lap quicker: P1 after lap 1.
  assert.deepEqual(start.hero, { code: 'ALO', delta: 3, from: 4, to: 1 })
  assert.match(start.headline, /^Alo gains 3 places on lap 1$/)
  assert.equal(start.replay.focus, 'ALO')
  assert.ok(start.deltas.every((d) => Number.isInteger(d.delta)))
})

test('pit swing: the undercut is found, with the gap crossing zero', () => {
  // VER leads NOR by ~1 s; NOR stops on lap 10, VER on lap 12. NOR's new tyres
  // (1.5 s/lap quicker after the stop) win the place.
  const extra = { NOR: { 10: 21 } as Record<number, number>, VER: { 12: 21 } as Record<number, number> }
  for (let l = 11; l <= 20; l++) extra.NOR[l] = (extra.NOR[l] ?? 0) - 1.5
  const inputs = race({
    // LEC, 3 s a lap slower and never stopping, stays behind both.
    grid: { VER: 1, NOR: 2, LEC: 3 },
    pace: { VER: 80, NOR: 80.1, LEC: 83 },
    laps: 20,
    extra,
    pits: { NOR: [10], VER: [12] },
  })
  const r = buildRecap(inputs)
  const swing = chapter(r, 'pit-swing') as PitSwingChapter
  assert.ok(swing, 'pit-swing chapter')
  assert.equal(swing.a, 'NOR')
  assert.equal(swing.b, 'VER')
  assert.equal(swing.label, 'The undercut')
  assert.equal(swing.headline, 'Nor undercuts Ver for P1')
  assert.ok(swing.gap[0].gap > 0 && swing.gap[swing.gap.length - 1].gap < 0)
  assert.deepEqual(swing.pits, [
    { code: 'NOR', lap: 10 },
    { code: 'VER', lap: 12 },
  ])
  assert.equal(swing.tiles.at(-1)?.label, 'Net swing')
  // The stops aren't on-track passes.
  assert.equal(chapter(r, 'battle'), undefined)
})

test('battle: an on-track pass, located on the lap by the time-at-distance crossing', () => {
  // NOR sits 0.05–0.15 s behind LEC until LEC loses a second on lap 3.
  const inputs = race({
    grid: { VER: 1, LEC: 2, NOR: 3 },
    pace: { VER: 80, LEC: 80.3, NOR: 80.2 },
    laps: 6,
    extra: { LEC: { 3: 1.0 } },
  })
  const pass = pickPass(inputs)
  assert.ok(pass, 'a pass')
  assert.equal(pass.lap, 3)
  // NOR (3) passed LEC (2).
  assert.deepEqual([pass.a, pass.b], [3, 2])

  // Channels: both cars over 0..2000 m; LEC loses its second around 1.2 km (Turn 4).
  const lap = (t0: number, slowFrom: number, slow: number): LapChannels => {
    const n = 401
    const distance = Array.from({ length: n }, (_, i) => i * 5)
    const sessionTime = distance.map((d) => t0 + d / 60 + (d > slowFrom ? Math.min(slow, ((d - slowFrom) / 200) * slow) : 0))
    return {
      sessionTime,
      distance,
      speed: distance.map((d) => (Math.abs(d - 1200) < 100 ? 120 : 300)),
      throttle: distance.map(() => 100),
      brake: distance.map((d) => (Math.abs(d - 1150) < 30 ? 1 : 0)),
      drs: distance.map(() => 12),
      nGear: distance.map(() => 7),
    }
  }
  const r = buildRecap(inputs, pass, { a: lap(1000.4, 0, 0), b: lap(1000, 1100, 1) })
  const battle = chapter(r, 'battle') as BattleChapter
  assert.ok(battle.trace, 'trace')
  // LEC at d: 1000 + d/60 + slow; NOR: 1000.4 + d/60 → flips once LEC has lost 0.4 s, 80 m after 1100.
  assert.ok(Math.abs(battle.trace.passAt - 1180) <= 10, `passAt ${battle.trace.passAt}`)
  assert.equal(battle.headline, 'Nor passes Lec for P2 into Turn 4')
  assert.equal(battle.tiles.length, 2)
  assert.equal(battle.tiles[0].drs, true)
  assert.match(battle.tiles[1].delta ?? '', /^[+−]\d\.\d\ds$/)
  assert.equal(battle.replay.cam, 'chase')
  assert.ok(battle.replay.atMs && battle.replay.atMs > 1000_000)
})

test('no passes, no pit swings: just the start and the flag', () => {
  const r = buildRecap(
    race({ grid: { VER: 1, NOR: 2, LEC: 3 }, pace: { VER: 80, NOR: 80.2, LEC: 80.4 }, laps: 10 }),
  )
  assert.deepEqual(
    r.chapters.map((c) => c.kind),
    ['start', 'finish'],
  )
  const start = chapter(r, 'start') as StartChapter
  assert.equal(start.hero, null)
  assert.equal(start.headline, 'Ver leads away from pole')
  const finish = chapter(r, 'finish') as FinishChapter
  assert.equal(finish.results[0].gap, 'Winner')
  assert.match(finish.results[1].gap, /^\+\d+\.\d{3}s$/)
  assert.match(finish.headline, /^Ver (wins|holds on) by \d+\.\d seconds$/)
  assert.ok(finish.fastestLap)
})

test('missing lap times borrow the field median instead of breaking the gaps', () => {
  const r = buildRecap(
    race({
      grid: { VER: 1, NOR: 2 },
      pace: { VER: 80, NOR: 80.1 },
      laps: 5,
      nullLaps: { NOR: [1] },
    }),
  )
  for (const ch of r.chapters) {
    assert.doesNotMatch(`${ch.headline} ${ch.dek}`, /NaN|undefined|null/)
  }
})

test('formatLapTime', () => {
  assert.equal(formatLapTime(91.447), '1:31.447')
  assert.equal(formatLapTime(65.0), '1:05.000')
})

/**
 * The 2024 Austrian Grand Prix as the FastF1 ingest stores it (trimmed to the
 * columns the recap reads), with OpenF1's pit and race-control feeds parsed
 * by lib/raceControl, and the pass lap's channels for its two cars.
 */
test('2024 Austrian GP: the recap matches what happened', async () => {
  const { readFileSync } = await import('node:fs')
  const fx = JSON.parse(readFileSync(new URL('./__fixtures__/austria-2024.json', import.meta.url), 'utf8')) as {
    inputs: RecapInputs
    pass: ReturnType<typeof pickPass>
    channels: { a: LapChannels | null; b: LapChannels | null } | null
  }
  const pass = pickPass(fx.inputs)
  assert.deepEqual(pass, fx.pass)
  const r = buildRecap(fx.inputs, pass, fx.channels)

  assert.equal(r.totalLaps, 71)
  assert.deepEqual(
    r.chapters.map((c) => c.kind),
    // The front-runners stopped on the same laps: no undercut worth a chapter.
    ['start', 'battle', 'finish'],
  )

  const start = chapter(r, 'start') as StartChapter
  assert.match(start.dek, /Verstappen kept the lead from pole\./)
  // Leclerc pitted for a new front wing on lap 1.
  assert.deepEqual(start.deltas.at(-1), { code: 'LEC', delta: -12 })

  // After Verstappen and Norris collided on lap 64, Piastri took P2 from Sainz.
  const battle = chapter(r, 'battle') as BattleChapter
  assert.equal(battle.headline, 'Piastri passes Sainz for P2 into Turn 6')
  assert.equal(battle.lap, 65)
  assert.ok(battle.trace && battle.trace.a.length > 20 && battle.trace.b.length > 20)
  assert.equal(battle.trace.apex?.label, 'Turn 6 apex')
  assert.ok(battle.replay.atMs && battle.replay.atMs > 0)

  const finish = chapter(r, 'finish') as FinishChapter
  assert.equal(finish.headline, 'Russell holds on by 1.9 seconds')
  assert.match(finish.dek, /took the lead from Verstappen on lap 64\./)
  assert.deepEqual(
    finish.results.map((x) => `${x.pos} ${x.code} ${x.gap} ${x.pts}`),
    ['1 RUS Winner 25', '2 PIA +1.906s 18', '3 SAI +4.533s 15', '4 HAM +23.142s 12', '5 VER +37.253s 10'],
  )
  assert.deepEqual(finish.fastestLap, { code: 'ALO', time: '1:07.694', lap: 70 })

  for (const ch of r.chapters) assert.doesNotMatch(`${ch.kicker} ${ch.headline} ${ch.dek}`, /NaN|undefined|null/)
})
