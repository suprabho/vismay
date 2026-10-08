import { test } from 'node:test'
import assert from 'node:assert/strict'
import { biggestRun, clockSeconds, elapsed, gameLength, maxLeads, type MarginPoint } from './margin'

function p(period: number, clock: string, home: number, away: number): MarginPoint {
  return { t: elapsed(period, clock), period, clock, home, away }
}

test('clock and elapsed time', () => {
  assert.equal(clockSeconds('8:30'), 510)
  assert.equal(clockSeconds('45.2'), 45.2)
  assert.equal(elapsed(1, '12:00'), 0)
  assert.equal(elapsed(4, '0:00'), 2880)
  assert.equal(elapsed(5, '0:00'), 3180)
  assert.equal(gameLength(4), 2880)
  assert.equal(gameLength(6), 3480)
})

test('biggestRun finds the decisive away run and its window', () => {
  const pts = [
    p(1, '12:00', 0, 0),
    p(4, '9:00', 90, 76), // home up 14
    p(4, '8:30', 90, 79),
    p(4, '6:00', 92, 88),
    p(4, '3:00', 94, 96),
    p(4, '1:30', 94, 98), // away 22–4 since 9:00
    p(4, '0:30', 98, 100),
  ]
  const run = biggestRun(pts)
  assert.ok(run)
  assert.equal(run.side, 'away')
  assert.equal(run.for, 22)
  assert.equal(run.against, 4)
  assert.equal(run.fromClock, '8:30')
  assert.equal(run.toClock, '1:30')
  assert.equal(run.period, 4)
  assert.equal(run.endPeriod, 4)
})

test('biggestRun ignores small swings', () => {
  const pts = [p(1, '12:00', 0, 0), p(1, '11:00', 2, 0), p(1, '10:00', 2, 3), p(1, '9:00', 5, 3)]
  assert.equal(biggestRun(pts), null)
})

test('maxLeads', () => {
  const pts = [p(1, '12:00', 0, 0), p(1, '10:00', 9, 2), p(2, '5:00', 30, 41)]
  assert.deepEqual(maxLeads(pts), { home: 7, away: 11 })
})

test('biggestRun stays inside the time window instead of spanning a blowout', () => {
  // Home pulls away steadily: +4 every three minutes for the whole game.
  const pts: MarginPoint[] = [p(1, '12:00', 0, 0)]
  for (let i = 1; i <= 16; i++) {
    const t = i * 180
    const period = Math.min(4, Math.floor((t - 1) / 720) + 1)
    const left = period * 720 - t
    pts.push({ t, period, clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, home: i * 6, away: i * 2 })
  }
  const run = biggestRun(pts)
  assert.ok(run)
  assert.ok(pts[run.endIndex].t - pts[run.startIndex].t <= 600)
  assert.equal(run.for - run.against, 12)
})
