/**
 * theanalyst.com match discovery — resolves fixtures rows to theanalyst
 * matchIds (+ the competitionId/seasonId pair the match centre addresses
 * matches by) so the match-facts scraper can address their match-centre
 * pages.
 *
 * VERIFIED LIVE (2026-08-24), replacing an earlier, incorrect design: the
 * match centre wrapper page does NOT list a competition's matches when
 * opened without a matchId — its own script no-ops without one
 * ("Missing required query parameters for iframe."), so there is no
 * listing view at that URL at all (see docs/theanalyst-scraping.md's
 * blocker section for the dead end this replaced).
 *
 * The real listing lives at `https://theanalyst.com/competition/<slug>/fixtures`
 * — but even that only shows ONE day's matches at a time, via a date-picker
 * widget. Getting a window of history means: open the page, click the
 * header to open its month calendar, read which day cells are marked as
 * having matches (`aria-label` doesn't say "no matches"), then click each
 * matchday cell in turn and read that day's fixture tiles — each of which
 * links to the match centre with matchId + competitionId + seasonId already
 * in the query string, so this discovers the opaque id pair fresh every run
 * instead of needing it hand-curated (see theanalyst/competitions.ts).
 * Clicking a matchday cell closes the calendar, so it's reopened before
 * each click. When the lookback window reaches back past the calendar's
 * currently-rendered month, the "Previous month" button is clicked too —
 * it's disabled at a real boundary (verified: season start), which doubles
 * as a natural stop condition.
 *
 * A resolved id is persisted onto the fixtures row (theanalyst_match_id is
 * unique), so discovery is a one-time cost per fixture: callers only pass
 * fixtures where theanalyst_match_id is still null.
 */

import { newRenderedPage } from './fetch';
import { canonicalTeamKey } from '../entityResolver';

export type DiscoveredMatch = {
  matchId: string;
  competitionId: string;
  seasonId: string;
  homeTeamRaw: string;
  awayTeamRaw: string;
  /** The calendar day cell this match was found under, YYYY-MM-DD. */
  kickoffDate: string;
};

export type UnmappedFixture = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
};

export type ResolvedMatch = {
  matchId: string;
  competitionId: string;
  seasonId: string;
};

const CALENDAR_HEADER_SELECTOR = '.DatePickerHeader-module_datepicker-header-date-month-year__DQNgv';
const CALENDAR_GRID_SELECTOR = 'table[role="grid"]';
const PREV_MONTH_SELECTOR = '[aria-label="Previous month"]';

// Safety backstops, not expected limits in normal operation (a 30-day
// lookback in one league is typically well under both).
const MAX_MONTHS_BACK = 4;
const MAX_MATCHDAYS_PER_RUN = 40;

function fixturesUrl(theanalystSlug: string): string {
  return `https://theanalyst.com/competition/${theanalystSlug}/fixtures`;
}

/** Ensures the month calendar popup is open, opening it if a click closed it. */
async function ensureCalendarOpen(page: import('playwright').Page): Promise<void> {
  const open = await page.locator(CALENDAR_GRID_SELECTOR).isVisible().catch(() => false);
  if (open) return;
  await page.click(CALENDAR_HEADER_SELECTOR);
  await page.waitForTimeout(500);
}

/** Matchday (YYYY-MM-DD) cells currently rendered in the open calendar month. */
async function readVisibleMatchdays(page: import('playwright').Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('td[data-date]'))
      .filter((td) => !(td.getAttribute('aria-label') ?? '').includes('no matches'))
      .map((td) => td.getAttribute('data-date')!)
  );
}

/**
 * Collects every matchday (YYYY-MM-DD) in [cutoffDate, todayDate], paging
 * the calendar back a month at a time as needed. Stops early if the
 * "Previous month" button is disabled (a real boundary — verified: season
 * start) or after MAX_MONTHS_BACK as a backstop.
 */
async function collectMatchdaysInWindow(
  page: import('playwright').Page,
  cutoffDate: string,
  todayDate: string
): Promise<string[]> {
  const collected = new Set<string>();
  for (let monthsBack = 0; monthsBack < MAX_MONTHS_BACK; monthsBack++) {
    await ensureCalendarOpen(page);
    const matchdays = await readVisibleMatchdays(page);
    for (const d of matchdays) if (d >= cutoffDate && d <= todayDate) collected.add(d);

    const earliestShown = matchdays.length ? [...matchdays].sort()[0] : null;
    if (!earliestShown || earliestShown <= cutoffDate) break; // this month's grid already reaches our cutoff

    const prevBtn = page.locator(PREV_MONTH_SELECTOR);
    const disabled = await prevBtn.getAttribute('disabled');
    if (disabled !== null) break;
    await prevBtn.click();
    await page.waitForTimeout(600);
  }
  return [...collected].sort();
}

/** "Arsenal" / "Coventry" text nodes under one fixture tile → [home, away]. */
async function readMatchesForVisibleDay(
  page: import('playwright').Page,
  kickoffDate: string
): Promise<DiscoveredMatch[]> {
  return page.evaluate((kickoffDate) => {
    const tiles = Array.from(document.querySelectorAll('a[href*="matchId="]'));
    const out: {
      matchId: string;
      competitionId: string;
      seasonId: string;
      homeTeamRaw: string;
      awayTeamRaw: string;
      kickoffDate: string;
    }[] = [];
    for (const tile of tiles) {
      const teams = Array.from(tile.querySelectorAll('[class*="fixture-tile-team"]'))
        .map((t) => t.textContent?.trim())
        .filter((t): t is string => !!t);
      if (teams.length < 2) continue;
      const href = (tile as HTMLAnchorElement).href;
      let u: URL;
      try {
        u = new URL(href);
      } catch {
        continue;
      }
      const matchId = u.searchParams.get('matchId');
      const competitionId = u.searchParams.get('competitionId');
      const seasonId = u.searchParams.get('seasonId');
      const [homeTeamRaw, awayTeamRaw] = teams;
      if (!matchId || !competitionId || !seasonId || !homeTeamRaw || !awayTeamRaw) continue;
      out.push({ matchId, competitionId, seasonId, homeTeamRaw, awayTeamRaw, kickoffDate });
    }
    return out;
  }, kickoffDate);
}

export async function discoverMatchesForCompetition(
  theanalystSlug: string,
  lookbackDays: number
): Promise<DiscoveredMatch[]> {
  const { page, close } = await newRenderedPage();
  try {
    await page.goto(fixturesUrl(theanalystSlug), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(CALENDAR_HEADER_SELECTOR, { timeout: 15_000 });

    const todayDate = new Date().toISOString().slice(0, 10);
    const cutoffDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

    const matchdays = (await collectMatchdaysInWindow(page, cutoffDate, todayDate)).slice(0, MAX_MATCHDAYS_PER_RUN);

    const results: DiscoveredMatch[] = [];
    for (const date of matchdays) {
      await ensureCalendarOpen(page);
      await page.click(`td[data-date="${date}"]`);
      await page.waitForTimeout(1000);
      results.push(...(await readMatchesForVisibleDay(page, date)));
    }
    return results;
  } finally {
    await close();
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pair discovered matches with unmapped fixtures. Returns fixture_id →
 * {matchId, competitionId, seasonId} for every unambiguous (home, away,
 * date-window) hit.
 */
export function matchFixtures(
  candidates: DiscoveredMatch[],
  fixtures: UnmappedFixture[]
): Map<string, ResolvedMatch> {
  const byTeams = new Map<string, DiscoveredMatch[]>();
  for (const c of candidates) {
    const key = `${canonicalTeamKey(c.homeTeamRaw)}|${canonicalTeamKey(c.awayTeamRaw)}`;
    const list = byTeams.get(key) ?? [];
    list.push(c);
    byTeams.set(key, list);
  }

  const resolved = new Map<string, ResolvedMatch>();
  for (const f of fixtures) {
    const key = `${canonicalTeamKey(f.homeTeamName)}|${canonicalTeamKey(f.awayTeamName)}`;
    const matches = byTeams.get(key);
    if (!matches?.length) continue;

    const kickoff = Date.parse(f.kickoffAt);
    const inWindow = matches.filter((m) => {
      const d = Date.parse(m.kickoffDate);
      return Number.isFinite(d) ? Math.abs(d - kickoff) <= DAY_MS : true;
    });

    // A team pairing repeats across a season (home/away legs, cups) — only map
    // when exactly one candidate survives the date window.
    const only = inWindow.length === 1 ? inWindow[0] : undefined;
    if (only) {
      resolved.set(f.id, { matchId: only.matchId, competitionId: only.competitionId, seasonId: only.seasonId });
    } else if (inWindow.length > 1) {
      console.log(
        `[theanalyst-discovery] ambiguous: ${f.homeTeamName} vs ${f.awayTeamName} matched ${inWindow.length} listings — skipped`
      );
    }
  }

  return resolved;
}
