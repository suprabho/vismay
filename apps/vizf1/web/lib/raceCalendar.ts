import type { RaceRow } from '@vismay/f1-viz/types'

export function racesByStatus(races: RaceRow[], status: RaceRow['status']) {
  return races.filter(r => r.status === status).sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)
}

/** Dates in the schedule are race-day labels, not local-midnight instants. */
export function raceDateLabel(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })
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

export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7)
}
