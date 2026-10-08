import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, addMonths, countdown, dayKey, dayRange, weekStart, zoneLabel } from './time'

test('dayKey buckets an instant by the viewer zone', () => {
  // 7:30 PM ET on 7 Nov is 6:00 AM IST on 8 Nov.
  const tip = '2026-11-08T00:30:00Z'
  assert.equal(dayKey(tip, 'America/New_York'), '2026-11-07')
  assert.equal(dayKey(tip, 'Asia/Kolkata'), '2026-11-08')
})

test('day arithmetic is DST-safe', () => {
  assert.equal(addDays('2026-11-01', 1), '2026-11-02')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(weekStart('2026-11-06'), '2026-11-02')
  assert.equal(weekStart('2026-11-08'), '2026-11-02')
  assert.equal(addMonths('2026-12-15', 1), '2027-01-01')
  assert.deepEqual(dayRange('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
})

test('zone labels prefer abbreviations', () => {
  assert.equal(zoneLabel('America/New_York'), 'ET')
  assert.equal(zoneLabel('Asia/Kolkata'), 'IST')
})

test('countdown', () => {
  const now = new Date('2026-11-06T02:10:00Z')
  assert.equal(countdown('2026-11-06T03:30:00Z', now), 'in 1h 20m')
  assert.equal(countdown('2026-11-06T03:00:00Z', now), 'in 50m')
  assert.equal(countdown('2026-11-06T02:00:00Z', now), null)
})
