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
import { teamKeyVariants } from '../entityResolver';

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
  /** Human-navigable page for this match — same one the admin's "not yet
   *  discovered" manual-entry form parses ids back out of, so both producers
   *  keep the ids and the stored URL consistent. */
  url: string;
};

/** The wrapper page a person can actually open — verified live (2026-08-24)
 *  as the href on theanalyst.com's own fixture-tile links. */
export function theanalystMatchUrl(competitionId: string, seasonId: string, matchId: string): string {
  const params = new URLSearchParams({ competitionId, seasonId, matchId });
  return `https://theanalyst.com/opta-football-match-centre?${params}`;
}

const CALENDAR_HEADER_SELECTOR = '.DatePickerHeader-module_datepicker-header-date-month-year__DQNgv';
const CALENDAR_GRID_SELECTOR = 'table[role="grid"]';
const PREV_MONTH_SELECTOR = '[aria-label="Previous month"]';
const NEXT_MONTH_SELECTOR = '[aria-label="Next month"]';

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

/**
 * Pages the OPEN calendar to the month whose grid contains `date`, so the
 * day cell can be clicked. Needed because collectMatchdaysInWindow leaves the
 * calendar on whatever month it paged back to, and a click only works on a
 * cell in the currently-rendered grid (each grid spans ~6 weeks, e.g. the
 * August grid runs 26 Jul → 5 Sep). Verified live 2026-09-09: this is why
 * UCL discovery timed out every run — its first matchday of the season
 * (8 Sep) sat just past the August grid the collector had paged back to,
 * while the Premier League's early-September dates happened to fall inside
 * August's trailing week, so it never hit the bug.
 */
async function showMonthContaining(page: import('playwright').Page, date: string): Promise<boolean> {
  for (let step = 0; step < 6; step++) {
    const range = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td[data-date]')).map((td) => td.getAttribute('data-date')!);
      return cells.length ? { first: cells[0]!, last: cells[cells.length - 1]! } : null;
    });
    if (!range) return false;
    if (date >= range.first && date <= range.last) return true;
    const btn = page.locator(date < range.first ? PREV_MONTH_SELECTOR : NEXT_MONTH_SELECTOR);
    if ((await btn.getAttribute('disabled')) !== null) return false;
    await btn.click();
    await page.waitForTimeout(600);
  }
  return false;
}

/**
 * One day's fixture tiles → DiscoveredMatch[]. Tile markup as verified live
 * 2026-09-10 (it changed overnight from the 2026-08-24 shape, which had the
 * team nodes INSIDE the match-centre `<a>` — the reader silently returned
 * zero matches for a day until this was widened):
 *
 *   <li class="MatchTileShell…match-tile-shell FixtureTile…fixture-tile">
 *     <a class="…match-tile-shell__link" href="…?competitionId=…&seasonId=…&matchId=…">
 *       <span class="…match-tile-shell__sr">Real Madrid v Internazionale (opens in a new tab)</span>
 *     </a>
 *     <div class="…fixture-tile__row">
 *       … <a class="…fixture-tile-team"><span class="…fixture-tile-team__name">Real Madrid</span>…</a>
 *       … <a class="…fixture-tile-team …--reverse"><span class="…fixture-tile-team__name">Inter</span>
 *                                                  <span class="…fixture-tile-team__sr">Internazionale</span>…</a>
 *
 * So: the tile is the matchId link's closest `<li>`, team names are the
 * `fixture-tile-team__name` nodes anywhere in it (display short names —
 * "Inter", the same spellings teamKeyVariants/ALIASES are tuned to), with
 * the link's own "A v B" screen-reader text as the fallback. The page also
 * carries a horizontal "match ticker" strip (`match-ticker-tile`) of
 * today's/live matches regardless of the selected day — skipped, or they'd
 * be stamped with the wrong kickoffDate. Deduped by matchId.
 */
async function readMatchesForVisibleDay(
  page: import('playwright').Page,
  kickoffDate: string
): Promise<DiscoveredMatch[]> {
  return page.evaluate((kickoffDate) => {
    const anchors = Array.from(document.querySelectorAll('a[href*="matchId="]'));
    const seen = new Set<string>();
    const out: {
      matchId: string;
      competitionId: string;
      seasonId: string;
      homeTeamRaw: string;
      awayTeamRaw: string;
      kickoffDate: string;
    }[] = [];
    for (const a of anchors) {
      let u: URL;
      try {
        u = new URL((a as HTMLAnchorElement).href);
      } catch {
        continue;
      }
      const matchId = u.searchParams.get('matchId');
      const competitionId = u.searchParams.get('competitionId');
      const seasonId = u.searchParams.get('seasonId');
      if (!matchId || !competitionId || !seasonId || seen.has(matchId)) continue;

      const tile = a.closest('li') ?? a;
      if (/match-ticker-tile/.test(tile.className)) continue;

      let teams = Array.from(tile.querySelectorAll('[class*="fixture-tile-team__name"]'))
        .map((t) => t.textContent?.trim())
        .filter((t): t is string => !!t);
      if (teams.length < 2) {
        // Pre-2026-09-10 shape: whole team-link text, inside or beside the anchor.
        teams = Array.from(tile.querySelectorAll('[class*="fixture-tile-team"]'))
          .filter((t) => !/__(sr|badge|name)/.test(t.className))
          .map((t) => t.textContent?.trim())
          .filter((t): t is string => !!t);
      }
      if (teams.length < 2) {
        // Last resort: the link's screen-reader label "Home v Away (opens in a new tab)".
        const sr = a.textContent?.replace(/\(opens in.*$/i, '').replace(/,.*$/, '').trim() ?? '';
        const parts = sr.split(/\s+v\s+/);
        if (parts.length === 2) teams = parts.map((p) => p.trim());
      }
      if (teams.length < 2) continue;

      const [homeTeamRaw, awayTeamRaw] = teams;
      if (!homeTeamRaw || !awayTeamRaw) continue;
      seen.add(matchId);
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
      // One unreachable/unclickable day shouldn't lose the whole
      // competition's run — log it and move on to the next matchday.
      try {
        await ensureCalendarOpen(page);
        if (!(await showMonthContaining(page, date))) {
          console.warn(`[theanalyst-discovery] ${theanalystSlug}: could not page calendar to ${date} — skipped`);
          continue;
        }
        await page.click(`td[data-date="${date}"]`, { timeout: 10_000 });
        await page.waitForTimeout(1000);
        results.push(...(await readMatchesForVisibleDay(page, date)));
      } catch (e: any) {
        console.warn(`[theanalyst-discovery] ${theanalystSlug}: ${date} failed — ${e?.message?.split('\n')[0] ?? e}`);
      }
    }
    return results;
  } finally {
    await close();
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function hasOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

/**
 * Pair discovered matches with unmapped fixtures. Returns fixture_id →
 * {matchId, competitionId, seasonId} for every unambiguous (home, away,
 * date-window) hit.
 *
 * Matches on teamKeyVariants() overlap rather than an exact key, since
 * theanalyst.com's team names ("Palace", "Forest", "Man Utd") often share
 * no exact slug with our own official entity names ("Crystal Palace FC",
 * "Nottingham Forest FC", "Manchester United FC") — see teamKeyVariants'
 * doc comment. Candidate count is small (one competition's recent
 * matchdays), so an O(fixtures × candidates) scan is cheap.
 */
export function matchFixtures(
  candidates: DiscoveredMatch[],
  fixtures: UnmappedFixture[]
): Map<string, ResolvedMatch> {
  const candidateVariants = candidates.map((c) => ({
    c,
    home: teamKeyVariants(c.homeTeamRaw),
    away: teamKeyVariants(c.awayTeamRaw),
  }));

  const resolved = new Map<string, ResolvedMatch>();
  for (const f of fixtures) {
    const homeVariants = teamKeyVariants(f.homeTeamName);
    const awayVariants = teamKeyVariants(f.awayTeamName);
    const kickoff = Date.parse(f.kickoffAt);

    const inWindow = candidateVariants.filter(({ c, home, away }) => {
      if (!hasOverlap(homeVariants, home) || !hasOverlap(awayVariants, away)) return false;
      const d = Date.parse(c.kickoffDate);
      return Number.isFinite(d) ? Math.abs(d - kickoff) <= DAY_MS : true;
    });

    // A team pairing repeats across a season (home/away legs, cups) — only map
    // when exactly one candidate survives the date window.
    const only = inWindow.length === 1 ? inWindow[0]?.c : undefined;
    if (only) {
      resolved.set(f.id, {
        matchId: only.matchId,
        competitionId: only.competitionId,
        seasonId: only.seasonId,
        url: theanalystMatchUrl(only.competitionId, only.seasonId, only.matchId),
      });
    } else if (inWindow.length > 1) {
      console.log(
        `[theanalyst-discovery] ambiguous: ${f.homeTeamName} vs ${f.awayTeamName} matched ${inWindow.length} listings — skipped`
      );
    }
  }

  return resolved;
}
