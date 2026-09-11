import assert from 'node:assert/strict'
import test from 'node:test'
import type { RaceRow } from '@vismay/f1-viz/types'
import { calendarDays, calendarWeeks, localRaceDate, raceDateLabel, raceDayLabel, racesByStatus, raceTimeLabel, raceWeekend, shiftDate, shiftMonth, weekCells, weekendOverlapsMonth, weekendRangeLabel } from './raceCalendar'

test('calendar aligns Monday-first weeks and includes leap day', () => {
  const days = calendarDays('2028-02')
  assert.equal(days[0], null)
  assert.equal(days[1], '2028-02-01')
  assert.equal(days.filter(Boolean).length, 29)
  assert.equal(days[29], '2028-02-29')
  assert.equal(days.length % 7, 0)
  assert.equal(calendarDays('2026-02')[6], '2026-02-01')
  assert.equal(calendarWeeks('2026-10').length, 5)
  assert.deepEqual(calendarWeeks('2026-10')[0], [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
})

test('month navigation crosses year boundaries and plain date labels never shift', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftDate('2026-11-01', -2), '2026-10-30')
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01')
  assert.equal(raceDateLabel('2026-03-01'), '1 Mar')
})

test('race day and start time follow the viewer time zone', () => {
  const lasVegas = { date: '2026-11-22', time: '06:00:00Z' }
  assert.equal(localRaceDate(lasVegas, 'UTC'), '2026-11-22')
  assert.equal(localRaceDate(lasVegas, 'America/Los_Angeles'), '2026-11-21', 'a 06:00 UTC start is Saturday evening in Nevada')
  assert.equal(localRaceDate(lasVegas, 'Asia/Kolkata'), '2026-11-22')
  assert.equal(raceDayLabel(lasVegas, undefined, 'America/Los_Angeles'), 'Sat 21 Nov')
  assert.equal(raceTimeLabel(lasVegas, 'America/Los_Angeles'), '22:00 GMT-8')
  assert.equal(raceTimeLabel({ date: '2026-10-04', time: '14:00:00Z' }, 'Asia/Kolkata'), '19:30 GMT+5:30')
  assert.equal(localRaceDate({ date: '2026-10-04', time: null }, 'America/Los_Angeles'), '2026-10-04', 'placeholder days without a start time stay on their calendar day')
  assert.equal(raceTimeLabel({ date: '2026-10-04', time: null }), null)
})

test('a race weekend spans the two days before race day, in local time', () => {
  const weekend = raceWeekend({ date: '2026-10-04', time: '13:00:00Z' }, 'Asia/Kolkata')
  assert.deepEqual(weekend, { start: '2026-10-02', end: '2026-10-04', days: ['2026-10-02', '2026-10-03', '2026-10-04'] })
  assert.equal(weekendRangeLabel(weekend), 'Fri 2 Oct – Sun 4 Oct')
  const vegas = raceWeekend({ date: '2026-11-22', time: '06:00:00Z' }, 'America/Los_Angeles')
  assert.deepEqual(vegas.days, ['2026-11-19', '2026-11-20', '2026-11-21'])
  const monthCrossing = raceWeekend({ date: '2026-11-01', time: '13:00:00Z' }, 'UTC')
  assert.equal(monthCrossing.start, '2026-10-30')
  assert.ok(weekendOverlapsMonth(monthCrossing, '2026-10'))
  assert.ok(weekendOverlapsMonth(monthCrossing, '2026-11'))
  assert.ok(!weekendOverlapsMonth(monthCrossing, '2026-12'))
})

test('week cells merge weekend days into one spanning cell and clip at week and month edges', () => {
  const bahrain = { race: 'bahrain', weekend: raceWeekend({ date: '2026-10-04', time: '13:00:00Z' }, 'UTC') }
  const [firstWeek] = calendarWeeks('2026-10')
  const cells = weekCells(firstWeek, [bahrain])
  assert.deepEqual(cells.map(c => [c.date, c.race, c.span, c.column]), [
    [null, null, 1, 0], [null, null, 1, 1], [null, null, 1, 2], ['2026-10-01', null, 1, 3], ['2026-10-02', 'bahrain', 3, 4],
  ])
  // Race on a Monday: the weekend straddles two rows, so it renders as a 2-day span then a 1-day span.
  const monday = { race: 'monday', weekend: raceWeekend({ date: '2026-10-12', time: '13:00:00Z' }, 'UTC') }
  const weeks = calendarWeeks('2026-10')
  assert.deepEqual(weekCells(weeks[1], [monday]).at(-1), { date: '2026-10-10', race: 'monday', span: 2, column: 5 })
  assert.deepEqual(weekCells(weeks[2], [monday])[0], { date: '2026-10-12', race: 'monday', span: 1, column: 0 })
  // Race on 1 November: only the October days are visible in the October grid.
  const november = { race: 'nov', weekend: raceWeekend({ date: '2026-11-01', time: '13:00:00Z' }, 'UTC') }
  const lastWeek = weeks.at(-1) as (string | null)[]
  assert.deepEqual(weekCells(lastWeek, [november]).find(c => c.race), { date: '2026-10-30', race: 'nov', span: 2, column: 4 })
  assert.deepEqual(weekCells(calendarWeeks('2026-11')[0], [november]).find(c => c.race), { date: '2026-11-01', race: 'nov', span: 1, column: 6 })
})

test('completed races sort by date and exclude live, upcoming and canceled rounds', () => {
  const make = (round: number, date: string, status: RaceRow['status']) => ({ id: String(round), round, date, status } as RaceRow)
  const races = [make(3, '2026-04-01', 'finished'), make(5, '2026-05-01', 'canceled'), make(1, '2026-03-01', 'finished'), make(4, '2026-04-15', 'live'), make(6, '2026-06-01', 'upcoming')]
  assert.deepEqual(racesByStatus(races, 'finished').map(r => r.round), [1, 3])
  assert.deepEqual(racesByStatus(races, 'upcoming').map(r => r.round), [6])
  assert.equal(races[0].round, 3, 'sorting must not mutate query data')
  assert.deepEqual(racesByStatus([], 'finished'), [])
})
