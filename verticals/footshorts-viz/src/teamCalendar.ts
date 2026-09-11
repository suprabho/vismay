import type { FixtureRow, FixtureTeamRef } from './types'

/**
 * Pure helpers behind the team calendar (`TeamCalendar` / `fs:team-calendar` /
 * `fscard:calendar`): month parsing, the 7-column day grid, and picking one
 * team's fixtures out of a mixed list.
 *
 * Everything is computed in UTC. Kickoffs arrive as ISO instants and the
 * calendar renders on the server, in the catalog, and inside html-to-image
 * capture — a locale/zone-dependent day split would move matches across cells
 * between environments (the same reason `MatchRow` avoids toLocaleDateString).
 */

/** `YYYY-MM` — the one month a calendar shows. */
export type CalendarMonth = `${number}-${string}`

export type WeekStart = 'mon' | 'sun'

export const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/** Parse `YYYY-MM` into a 0-based month; null for anything else. */
export function parseCalendarMonth(raw: unknown): { year: number; month: number } | null {
  if (typeof raw !== 'string') return null
  const m = raw.match(MONTH_RE)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) - 1 }
}

export function isCalendarMonth(raw: unknown): raw is string {
  return parseCalendarMonth(raw) !== null
}

/** `YYYY-MM` for a UTC instant (ISO string or Date). */
export function calendarMonthOf(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "October 2026" — the calendar heading for a `YYYY-MM`. Falls back to the raw
 *  string so an unparseable month still shows something. */
export function formatCalendarMonth(month: string): string {
  const p = parseCalendarMonth(month)
  return p ? `${MONTH_LONG[p.month]} ${p.year}` : month
}

/** Does this fixture side belong to `teamId`? Matches on entity id OR slug —
 *  story configs key teams by id, the share-card composer by slug, and the
 *  bundled samples use the same value for both. */
export function refIsTeam(ref: FixtureTeamRef, teamId: string): boolean {
  return !!ref && (ref.id === teamId || ref.slug === teamId)
}

/** Whether `teamId` plays in this fixture (either side). */
export function fixtureHasTeam(fixture: FixtureRow, teamId: string): boolean {
  return refIsTeam(fixture.home, teamId) || refIsTeam(fixture.away, teamId)
}

/** True when `teamId` is the home side. Assumes `fixtureHasTeam` already held. */
export function isTeamHome(fixture: FixtureRow, teamId: string): boolean {
  return refIsTeam(fixture.home, teamId)
}

/** One of the team's fixtures, re-read from the team's perspective. */
export interface TeamFixture {
  fixture: FixtureRow
  home: boolean
  opponent: FixtureTeamRef
  opponentName: string
  /** 1-based day of the month (UTC). */
  day: number
  /** `[team goals, opponent goals]` once the match is finished; null otherwise. */
  score: [number, number] | null
  result: 'W' | 'D' | 'L' | null
}

export function toTeamFixture(fixture: FixtureRow, teamId: string): TeamFixture {
  const home = isTeamHome(fixture, teamId)
  const opponent = home ? fixture.away : fixture.home
  const opponentName =
    opponent?.name ?? (home ? fixture.away_team_name : fixture.home_team_name) ?? 'TBD'
  const teamGoals = home ? fixture.home_score : fixture.away_score
  const oppGoals = home ? fixture.away_score : fixture.home_score
  // Scores come as `null` from DB rows but `undefined` from generated configs.
  const finished = fixture.status === 'finished' && teamGoals != null && oppGoals != null
  const score: [number, number] | null = finished ? [teamGoals, oppGoals] : null
  const result = score ? (score[0] > score[1] ? 'W' : score[0] < score[1] ? 'L' : 'D') : null
  return {
    fixture,
    home,
    opponent,
    opponentName,
    day: new Date(fixture.kickoff_at).getUTCDate(),
    score,
    result,
  }
}

/**
 * The team's fixtures that fall inside `month` (UTC), in kickoff order, from the
 * team's perspective. Fixtures without a parseable kickoff are dropped.
 */
export function teamFixturesInMonth(
  fixtures: FixtureRow[],
  teamId: string,
  month: string,
): TeamFixture[] {
  return fixtures
    .filter(
      (f) =>
        fixtureHasTeam(f, teamId) &&
        !Number.isNaN(new Date(f.kickoff_at).getTime()) &&
        calendarMonthOf(f.kickoff_at) === month,
    )
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
    .map((f) => toTeamFixture(f, teamId))
}

/**
 * Months (`YYYY-MM`, ascending) in which `teamId` plays at least once, with the
 * match count — feeds the share-card month picker.
 */
export function teamMonths(
  fixtures: FixtureRow[],
  teamId: string,
): Array<{ month: string; count: number }> {
  const counts = new Map<string, number>()
  for (const f of fixtures) {
    if (!fixtureHasTeam(f, teamId)) continue
    if (Number.isNaN(new Date(f.kickoff_at).getTime())) continue
    const m = calendarMonthOf(f.kickoff_at)
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  return Array.from(counts, ([month, count]) => ({ month, count })).sort((a, b) =>
    a.month.localeCompare(b.month),
  )
}

/**
 * The month a calendar should open on when the author hasn't picked one: the
 * month of the team's next unplayed fixture on/after `now`, else the month of
 * their most recent fixture, else `now`'s month. Keeps a freshly added share
 * layer pointed at the upcoming schedule instead of an empty grid.
 */
export function defaultCalendarMonth(
  fixtures: FixtureRow[],
  teamId: string,
  now: Date = new Date(),
): string {
  const mine = fixtures
    .filter((f) => fixtureHasTeam(f, teamId) && !Number.isNaN(new Date(f.kickoff_at).getTime()))
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
  const nowIso = now.toISOString()
  const next = mine.find((f) => f.status !== 'finished' && f.kickoff_at >= nowIso)
  if (next) return calendarMonthOf(next.kickoff_at)
  const last = mine[mine.length - 1]
  if (last) return calendarMonthOf(last.kickoff_at)
  return calendarMonthOf(now)
}

/** One cell of the month grid: a day number, or null for a leading/trailing pad. */
export type CalendarCell = { day: number } | null

/**
 * The month laid out as whole weeks: leading pads before the 1st, trailing pads
 * after the last day, so every row is 7 cells. `weekStart` picks Monday-first
 * (default, European fixture lists) or Sunday-first.
 */
export function monthGrid(month: string, weekStart: WeekStart = 'mon'): CalendarCell[][] {
  const p = parseCalendarMonth(month)
  if (!p) return []
  const first = new Date(Date.UTC(p.year, p.month, 1))
  const daysInMonth = new Date(Date.UTC(p.year, p.month + 1, 0)).getUTCDate()
  // getUTCDay: 0 = Sunday. Rotate so the week starts on the requested day.
  const offset = weekStart === 'mon' ? (first.getUTCDay() + 6) % 7 : first.getUTCDay()
  const cells: CalendarCell[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d })
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: CalendarCell[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

/** Weekday initials in grid order for the chosen week start. */
export function weekdayInitials(weekStart: WeekStart = 'mon'): string[] {
  const sun = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return weekStart === 'mon' ? [...sun.slice(1), sun[0]!] : sun
}
