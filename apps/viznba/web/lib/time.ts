/**
 * Date helpers that work in the viewer's time zone. Days are `YYYY-MM-DD`
 * keys; arithmetic on them goes through UTC so DST never shifts a day.
 */

export const ET = 'America/New_York'

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The `YYYY-MM-DD` day an instant falls on in `tz`. */
export function dayKey(at: Date | string, tz: string): string {
  const d = typeof at === 'string' ? new Date(at) : at
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function todayKey(tz: string): string {
  return dayKey(new Date(), tz)
}

function toUtc(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(key: string, n: number): string {
  const d = toUtc(key)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)
}

/** Every day key from `start` to `end`, inclusive. */
export function dayRange(start: string, end: string): string[] {
  const out: string[] = []
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k)
  return out
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const dow = toUtc(key).getUTCDay() // 0 = Sunday
  return addDays(key, -((dow + 6) % 7))
}

export function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`
}

export function addMonths(key: string, n: number): string {
  const d = toUtc(monthStart(key))
  d.setUTCMonth(d.getUTCMonth() + n)
  return fromUtc(d)
}

export function isDayKey(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s).getTime())
}

const fmt = (opts: Intl.DateTimeFormatOptions) => (key: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(toUtc(key))

/** "Fri" */
export const weekdayShort = fmt({ weekday: 'short' })
/** "Friday" */
export const weekdayLong = fmt({ weekday: 'long' })
/** "6 Nov" */
export const dayMonth = fmt({ day: 'numeric', month: 'short' })
/** "November 2026" */
export const monthYear = fmt({ month: 'long', year: 'numeric' })

export function dayOfMonth(key: string): number {
  return Number(key.slice(8, 10))
}

/** "9:00 AM" in `tz`. */
export function clockTime(at: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at))
}

/**
 * Short zone label: "IST", "ET", "BST". `en-US` only knows US abbreviations
 * and prints "GMT+5:30" elsewhere, so try a couple of locales that do.
 */
export function zoneLabel(tz: string, at: Date = new Date()): string {
  if (tz === ET) return 'ET'
  for (const locale of ['en-US', 'en-IN', 'en-GB', 'en-AU']) {
    const part = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value
    if (part && !part.startsWith('GMT') && !part.startsWith('UTC')) return part
  }
  const fallback = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value
  return fallback ?? tz
}

/** "in 1h 20m", "in 50m", "in 2d" — null once it has started. */
export function countdown(at: string, now: Date = new Date()): string | null {
  const mins = Math.round((new Date(at).getTime() - now.getTime()) / 60_000)
  if (mins <= 0) return null
  if (mins < 60) return `in ${mins}m`
  if (mins < 48 * 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m ? `in ${h}h ${m}m` : `in ${h}h`
  }
  return `in ${Math.round(mins / 1440)}d`
}

/** "2h", "35m", "3d" — for article ages. */
export function ago(at: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000))
  if (mins < 60) return `${Math.max(1, mins)}m`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h`
  return `${Math.floor(mins / 1440)}d`
}
