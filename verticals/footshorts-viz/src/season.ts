/**
 * Season label helpers.
 *
 * football-data.org hands us a season as a start/end date pair; the fixtures
 * sync normalises it to one of two label shapes (see
 * `apps/footshorts/worker/src/fixtures.ts`):
 *
 *   multi-year league (Aug 2026 → May 2027) → "26-27"
 *   single-year cup   (Jun 2026 → Jul 2026) → "2026"
 *
 * Both shapes share the `fixtures.season` / `standings.season` column, so
 * anything ordering or comparing seasons has to understand both — a plain
 * string sort puts "2026" before "25-26", which is backwards.
 *
 * The `fixtures` table is append-only across seasons (the sync upserts on
 * `football_data_id` and never prunes), so every read that means "this season"
 * has to say so explicitly. These helpers are that vocabulary.
 */

const TWO_YEAR = /^(\d{2})-(\d{2})$/
const ONE_YEAR = /^(\d{4})$/

/**
 * Calendar year a season label starts in, or null when the label isn't a shape
 * we know. "26-27" → 2026, "2026" → 2026.
 */
export function seasonStartYear(season: string | null | undefined): number | null {
  if (!season) return null
  const s = season.trim()
  const two = TWO_YEAR.exec(s)
  if (two) return 2000 + Number(two[1])
  const one = ONE_YEAR.exec(s)
  if (one) return Number(one[1])
  return null
}

/**
 * Chronological compare, oldest first — `seasons.sort(compareSeasons)`.
 * Unrecognised labels sort before everything (they can't be claimed as the
 * current season) and tie-break alphabetically so the order stays stable.
 */
export function compareSeasons(a: string, b: string): number {
  const ya = seasonStartYear(a)
  const yb = seasonStartYear(b)
  if (ya == null && yb == null) return a.localeCompare(b)
  if (ya == null) return -1
  if (yb == null) return 1
  if (ya !== yb) return ya - yb
  // Same start year: a single-year cup ("2026") sits inside the league season
  // that starts the same August ("26-27"), so order the cup first.
  return a.localeCompare(b)
}

/** The most recent of a set of season labels, or null when there are none. */
export function latestSeason(seasons: Iterable<string>): string | null {
  let best: string | null = null
  for (const s of seasons) {
    if (!s) continue
    if (best === null || compareSeasons(s, best) > 0) best = s
  }
  return best
}

/** Display form for a season label: "26-27" → "2026/27", "2026" → "2026". */
export function formatSeason(season: string): string {
  const two = TWO_YEAR.exec(season.trim())
  if (two) return `${2000 + Number(two[1])}/${two[2]}`
  return season
}

/**
 * Month (0-indexed) a new football season is taken to begin in — June.
 *
 * Used to date-scope reads that span several competitions at once (a team plays
 * in a league *and* cups, whose season labels differ), where filtering on a
 * single season string isn't possible. June 1 is the quiet point of the
 * calendar: domestic leagues and the continental finals wrap by late May, and
 * the next season's qualifiers start from late June. The one competition this
 * splits awkwardly is a June/July international tournament (a World Cup runs
 * either side of that line but carries a single "2026" label) — those are
 * read through competition-scoped queries, which filter on the label itself.
 */
export const SEASON_START_MONTH = 5

/** Start of the season the given date falls in (June 1, UTC). */
export function seasonStartAt(now: Date = new Date()): Date {
  const year =
    now.getUTCMonth() >= SEASON_START_MONTH ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return new Date(Date.UTC(year, SEASON_START_MONTH, 1))
}

/** `seasonStartAt` as an ISO timestamp, ready for a Supabase `gte` filter. */
export function seasonStartIso(now: Date = new Date()): string {
  return seasonStartAt(now).toISOString()
}
