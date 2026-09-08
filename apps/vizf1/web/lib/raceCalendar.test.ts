import assert from 'node:assert/strict'
import test from 'node:test'
import type { RaceRow } from '@vismay/f1-viz/types'
import { calendarDays, raceDateLabel, racesByStatus, shiftMonth } from './raceCalendar'

test('calendar aligns Monday-first weeks and includes leap day', () => {
  const days = calendarDays('2028-02')
  assert.equal(days[0], null)
  assert.equal(days[1], '2028-02-01')
  assert.equal(days.filter(Boolean).length, 29)
  assert.equal(days[29], '2028-02-29')
  assert.equal(days.length % 7, 0)
  assert.equal(calendarDays('2026-02')[6], '2026-02-01')
})

test('month navigation crosses year boundaries and race dates stay in UTC', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(raceDateLabel('2026-03-01'), '1 Mar')
})

test('completed races sort by date and exclude live, upcoming and canceled rounds', () => {
  const make = (round: number, date: string, status: RaceRow['status']) => ({ id: String(round), round, date, status } as RaceRow)
  const races = [make(3, '2026-04-01', 'finished'), make(5, '2026-05-01', 'canceled'), make(1, '2026-03-01', 'finished'), make(4, '2026-04-15', 'live'), make(6, '2026-06-01', 'upcoming')]
  assert.deepEqual(racesByStatus(races, 'finished').map(r => r.round), [1, 3])
  assert.deepEqual(racesByStatus(races, 'upcoming').map(r => r.round), [6])
  assert.equal(races[0].round, 3, 'sorting must not mutate query data')
  assert.deepEqual(racesByStatus([], 'finished'), [])
})
