import type { Game } from './espn'
import { addDays, clockTime, dayKey, dayMonth, ET, weekdayShort, zoneLabel } from './time'

/** "TODAY", "TOMORROW", "YESTERDAY" or "SUN 8 NOV". */
export function relativeDay(key: string, today: string): string {
  if (key === today) return 'TODAY'
  if (key === addDays(today, 1)) return 'TOMORROW'
  if (key === addDays(today, -1)) return 'YESTERDAY'
  return `${weekdayShort(key)} ${dayMonth(key)}`.toUpperCase()
}

/** "Sun 8 Nov" */
export function shortDate(key: string): string {
  return `${weekdayShort(key)} ${dayMonth(key)}`
}

/** Local tip-off plus, when the viewer isn't on Eastern time, the ET time. */
export function tipoff(g: Game, tz: string): { local: string; et: string | null } {
  if (tz === ET) return { local: clockTime(g.date, tz), et: null }
  const etDay = dayKey(g.date, ET)
  const prefix = etDay === dayKey(g.date, tz) ? '' : `${weekdayShort(etDay)} `
  return {
    local: clockTime(g.date, tz),
    et: `${prefix}${clockTime(g.date, ET)} ${zoneLabel(ET)}`,
  }
}

export function localDay(g: Game, tz: string): string {
  return dayKey(g.date, tz)
}
