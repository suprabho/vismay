import type { RaceRow } from '@vismay/f1-viz/types'

type RaceTiming = Pick<RaceRow, 'date' | 'time'>

export type RaceWeekend = {
  /** Local calendar date (`YYYY-MM-DD`) of the first weekend day, usually the Friday. */
  start: string
  /** Local calendar date (`YYYY-MM-DD`) of race day. */
  end: string
  /** Every local calendar date from `start` to `end`, inclusive. */
  days: string[]
}

/** Grand Prix weekends run Friday–Sunday (practice, qualifying/sprint, race), so a weekend spans race day and the two days before it. */
export const WEEKEND_DAYS = 3

export function racesByStatus(races: RaceRow[], status: RaceRow['status']) {
  return races.filter(r => r.status === status).sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)
}

/** Formats a plain `YYYY-MM-DD` calendar date. The string is a day label, not an instant, so it is rendered without any zone shift. */
export function raceDateLabel(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })
}

/** The race start as an instant, or null when the schedule only carries a placeholder day without a start time. */
export function raceStart(race: RaceTiming): Date | null {
  return race.time ? new Date(`${race.date}T${race.time}`) : null
}

function calendarDateIn(instant: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * Race day as a calendar date in the viewer's time zone (or the given one).
 * Schedule rows store the UTC race day, which is the day before for viewers west of the venue
 * (e.g. a 06:00 UTC Las Vegas start is Saturday evening in Nevada).
 */
export function localRaceDate(race: RaceTiming, timeZone?: string) {
  const start = raceStart(race)
  return start ? calendarDateIn(start, timeZone) : race.date
}

export function shiftDate(date: string, deltaDays: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + deltaDays)).toISOString().slice(0, 10)
}

export function raceWeekend(race: RaceTiming, timeZone?: string): RaceWeekend {
  const end = localRaceDate(race, timeZone)
  const days = Array.from({ length: WEEKEND_DAYS }, (_, i) => shiftDate(end, i - (WEEKEND_DAYS - 1)))
  return { start: days[0], end, days }
}

export function weekendOverlapsMonth(weekend: RaceWeekend, month: string) {
  return weekend.days.some(day => day.startsWith(month))
}

/** "Fri 2 Oct – Sun 4 Oct" style label for a weekend span. */
export function weekendRangeLabel(weekend: RaceWeekend, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return `${raceDateLabel(weekend.start, options)} – ${raceDateLabel(weekend.end, options)}`
}

/** Race day formatted in the viewer's time zone, e.g. "Sun 4 Oct". */
export function raceDayLabel(race: RaceTiming, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }, timeZone?: string) {
  const start = raceStart(race)
  return start ? start.toLocaleDateString('en-GB', { ...options, timeZone }) : raceDateLabel(race.date, options)
}

/** Start time in the viewer's time zone with a short zone name, e.g. "14:00 GMT+5:30", or null when the time is not yet confirmed. */
export function raceTimeLabel(race: RaceTiming, timeZone?: string, options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }) {
  const start = raceStart(race)
  return start ? start.toLocaleTimeString('en-GB', { ...options, timeZone }) : null
}

/** The viewer's IANA time zone, e.g. "Asia/Kolkata". */
export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function calendarDays(month: string): (string | null)[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year, monthNumber - 1, 1))
  const offset = (start.getUTCDay() + 6) % 7
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const cells = Array.from({ length: offset + length }, (_, index) =>
    index < offset ? null : `${month}-${String(index - offset + 1).padStart(2, '0')}`,
  )
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** Monday-first weeks of a month, each exactly seven cells (null for padding days). */
export function calendarWeeks(month: string): (string | null)[][] {
  const days = calendarDays(month)
  return Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7))
}

export type CalendarCell<T> = { date: string | null; race: T | null; span: number; /** 0 = Monday … 6 = Sunday. */ column: number }

/**
 * Lays one week out as cells, merging the consecutive days of a race weekend into a single cell
 * with a column `span`. A weekend that crosses the week or month boundary is clipped to the visible days.
 */
export function weekCells<T>(week: (string | null)[], races: { race: T; weekend: RaceWeekend }[]): CalendarCell<T>[] {
  const cells: CalendarCell<T>[] = []
  for (let i = 0; i < week.length; ) {
    const date = week[i]
    const match = date ? races.find(r => r.weekend.days.includes(date)) : undefined
    if (!date || !match) {
      cells.push({ date, race: null, span: 1, column: i })
      i += 1
      continue
    }
    let span = 1
    while (i + span < week.length && week[i + span] && match.weekend.days.includes(week[i + span] as string)) span += 1
    cells.push({ date, race: match.race, span, column: i })
    i += span
  }
  return cells
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7)
}
