/**
 * theanalyst.com match discovery — resolves fixtures rows to theanalyst
 * matchIds so the match-facts scraper can address their match-centre pages.
 *
 * The match centre lists a competition's matches when opened without a
 * matchId, and each match links to itself with ?matchId=<id> in the query.
 * We collect those links, read the two team labels from the link text, and
 * match against our unmapped fixtures by (home team, away team, kickoff date
 * ±1 day) — the day window absorbs the UTC-vs-local display difference
 * between football-data kickoffs and theanalyst's rendered dates. Both sides
 * of the name comparison go through entityResolver's canonicalTeamKey so
 * "Man Utd" and "Manchester United" collapse to the same key.
 *
 * A resolved id is persisted onto the fixtures row (theanalyst_match_id is
 * unique), so discovery is a one-time cost per fixture: callers only pass
 * fixtures where theanalyst_match_id is still null.
 *
 * SELECTOR CAVEAT: written without network access to theanalyst.com — the
 * listing-page shape (match links carrying ?matchId=) and the "Home vs Away"
 * link-text convention are unverified. Check against the live site before
 * production (docs/theanalyst-scraping.md checklist).
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetch';
import { canonicalTeamKey } from '../entityResolver';

export type DiscoveredMatch = {
  matchId: string;
  homeTeamRaw: string;
  awayTeamRaw: string;
  /** Kickoff date if the listing shows one; null otherwise (name-only match). */
  kickoffDate: string | null;
};

export type UnmappedFixture = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
};

export function competitionListingUrl(competitionId: string, seasonId: string): string {
  const params = new URLSearchParams({ competitionId, seasonId });
  return `https://theanalyst.com/opta-football-match-centre?${params}`;
}

/** "Arsenal vs Chelsea" / "Arsenal v Chelsea" / "Arsenal - Chelsea" → sides. */
function splitTeams(text: string): [string, string] | null {
  const m = text.match(/^(.{2,60}?)\s+(?:vs?\.?|[—–-])\s+(.{2,60})$/i);
  const home = m?.[1];
  const away = m?.[2];
  if (!home || !away) return null;
  return [home.trim(), away.trim()];
}

export async function discoverMatchesForCompetition(
  competitionId: string,
  seasonId: string
): Promise<DiscoveredMatch[]> {
  const html = await fetchHtml(competitionListingUrl(competitionId, seasonId));
  const $ = cheerio.load(html);

  const byId = new Map<string, DiscoveredMatch>();

  $('a[href*="matchId="]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let matchId: string | null = null;
    try {
      matchId = new URL(href, 'https://theanalyst.com').searchParams.get('matchId');
    } catch {
      return;
    }
    if (!matchId || byId.has(matchId)) return;

    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const teams = splitTeams(text);
    if (!teams) return;

    const kickoffDate =
      $(el).find('time[datetime]').attr('datetime') ??
      $(el).closest('[data-date]').attr('data-date') ??
      null;

    byId.set(matchId, {
      matchId,
      homeTeamRaw: teams[0],
      awayTeamRaw: teams[1],
      kickoffDate,
    });
  });

  return [...byId.values()];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pair discovered matches with unmapped fixtures. Returns fixture_id →
 * matchId for every unambiguous (home, away, date-window) hit.
 */
export function matchFixtures(
  candidates: DiscoveredMatch[],
  fixtures: UnmappedFixture[]
): Map<string, string> {
  const byTeams = new Map<string, DiscoveredMatch[]>();
  for (const c of candidates) {
    const key = `${canonicalTeamKey(c.homeTeamRaw)}|${canonicalTeamKey(c.awayTeamRaw)}`;
    const list = byTeams.get(key) ?? [];
    list.push(c);
    byTeams.set(key, list);
  }

  const resolved = new Map<string, string>();
  for (const f of fixtures) {
    const key = `${canonicalTeamKey(f.homeTeamName)}|${canonicalTeamKey(f.awayTeamName)}`;
    const matches = byTeams.get(key);
    if (!matches?.length) continue;

    const kickoff = Date.parse(f.kickoffAt);
    const inWindow = matches.filter((m) => {
      if (!m.kickoffDate) return true; // no date on the listing → trust the team pairing
      const d = Date.parse(m.kickoffDate);
      return Number.isFinite(d) ? Math.abs(d - kickoff) <= DAY_MS : true;
    });

    // A team pairing repeats across a season (home/away legs, cups) — only map
    // when exactly one candidate survives the date window.
    const only = inWindow.length === 1 ? inWindow[0] : undefined;
    if (only) {
      resolved.set(f.id, only.matchId);
    } else if (inWindow.length > 1) {
      console.log(
        `[theanalyst-discovery] ambiguous: ${f.homeTeamName} vs ${f.awayTeamName} matched ${inWindow.length} listings — skipped`
      );
    }
  }

  return resolved;
}
