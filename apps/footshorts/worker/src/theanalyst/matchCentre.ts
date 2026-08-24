/**
 * theanalyst.com Opta match-centre scraper — per-match stats for both sides.
 *
 * VERIFIED LIVE (2026-08-24) against a real finished match. Two things were
 * wrong in the original (authored without site access) version:
 *
 * 1. The URL was the `theanalyst.com/opta-football-match-centre` wrapper
 *    page — same cross-origin-iframe problem as Power Rankings' article
 *    (see powerRankings.ts): the wrapper's own script only sets its iframe's
 *    `src` client-side, so `page.content()` on it never has the widget's
 *    DOM. `matchCentreUrl` now points straight at the widget it proxies to,
 *    `dataviz.theanalyst.com/opta-football-match-centre/`.
 * 2. The stats aren't one generic "label near two numbers" shape — the
 *    widget renders SIX separate `table.Opta-Stats-Bars` sub-widgets (Match
 *    facts, Attacking, Passing, Shooting, Defending, Discipline), each a
 *    label `<tr><th>` immediately followed by a data `<tr>` with THREE
 *    `<td>`: home value, a bar `<div>` (which duplicates both values as text
 *    inside it — a naive "find N numbers in this row" scan over-collects),
 *    away value. xG lives in a DIFFERENT table, `table.Opta-shotoverview`,
 *    one `<tr data-stat="...">` per stat with `<td class="Opta-Home">` /
 *    `<th class="Opta-StatLabel">` / `<td class="Opta-Away">`.
 *    `extractLabelPairs` now reads both shapes directly by class name
 *    instead of guessing at whitespace/number layout.
 *
 * Real label spellings confirmed live: "Total Team xG" (not "expected goals
 * (xg)"), "Fouls conceded" (not "fouls committed"), "Corners won" AND
 * "Corner awarded" (two different tables track corners differently — either
 * can win), "Passing accuracy" (already correct). "Big chances"/"big chances
 * missed" did not appear anywhere on the one match checked — still
 * unverified; they just land in raw_stats as null if theanalyst doesn't
 * label them this way. Deterministic parsing, no LLM — the page is numeric
 * data.
 */

import * as cheerio from 'cheerio';
import { fetchRenderedHtml } from './fetch';

export type SideStats = {
  xg: number | null;
  shots: number | null;
  shots_on_target: number | null;
  possession: number | null;
  passes: number | null;
  pass_accuracy: number | null;
  big_chances: number | null;
  big_chances_missed: number | null;
  corners: number | null;
  fouls: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  offsides: number | null;
  raw_stats: Record<string, number>;
};

export type MatchFactsPayload = {
  home: SideStats;
  away: SideStats;
};

export function matchCentreUrl(competitionId: string, seasonId: string, matchId: string): string {
  const params = new URLSearchParams({ competitionId, seasonId, matchId });
  return `https://dataviz.theanalyst.com/opta-football-match-centre/?${params}`;
}

/** Column name → label spellings to try, most specific (real, verified) first. */
const STAT_LABELS: Record<keyof Omit<SideStats, 'raw_stats'>, string[]> = {
  xg: ['total team xg', 'expected goals (xg)', 'expected goals', 'xg'],
  shots: ['shots', 'total shots'],
  shots_on_target: ['shots on target'],
  possession: ['possession'],
  passes: ['passes', 'total passes'],
  pass_accuracy: ['passing accuracy', 'pass accuracy'],
  big_chances: ['big chances created', 'big chances'],
  big_chances_missed: ['big chances missed'],
  corners: ['corners won', 'corner awarded', 'corners'],
  fouls: ['fouls conceded', 'fouls committed', 'fouls'],
  yellow_cards: ['yellow cards'],
  red_cards: ['red cards'],
  offsides: ['offsides'],
};

function emptySide(): SideStats {
  return {
    xg: null, shots: null, shots_on_target: null, possession: null, passes: null,
    pass_accuracy: null, big_chances: null, big_chances_missed: null, corners: null,
    fouls: null, yellow_cards: null, red_cards: null, offsides: null, raw_stats: {},
  };
}

function parseStatNumber(raw: string): number | null {
  const stripped = raw.replace(/[^\d.+-]/g, '');
  // Number('') is 0, not NaN — guard so a genuinely empty cell doesn't parse
  // as a real 0 value (see the same fix in powerRankings.ts's toNumber).
  if (!/\d/.test(stripped)) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads both real stat-table shapes on the match-centre widget (see module
 * doc comment): the six `Opta-Stats-Bars` sub-widgets, and the
 * `Opta-shotoverview` table (xG). First occurrence of a label wins if it
 * somehow appears in both.
 */
function extractLabelPairs($: cheerio.CheerioAPI): Map<string, [number, number]> {
  const pairs = new Map<string, [number, number]>();

  $('table.Opta-Stats-Bars').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    for (let i = 0; i < rows.length - 1; i++) {
      const th = $(rows[i]).find('th.Opta-Stats-Bars-Text');
      if (!th.length) continue;
      const label = th.text().replace(/\s+/g, ' ').trim().toLowerCase();
      if (!label || pairs.has(label)) continue;

      const cells = $(rows[i + 1]).find('td.Opta-Outer');
      if (cells.length < 2) continue;
      const home = parseStatNumber($(cells[0]).text());
      const away = parseStatNumber($(cells[cells.length - 1]).text());
      if (home !== null && away !== null) pairs.set(label, [home, away]);
    }
  });

  $('table.Opta-shotoverview tr').each((_, tr) => {
    const $tr = $(tr);
    const th = $tr.find('th.Opta-StatLabel');
    if (!th.length) return;
    // Strip the info-tooltip's own text ("The total xG from a side's
    // chances.") out of the label — it's nested inside the same <th>.
    const label = th
      .clone()
      .find('.Opta-infotooltip')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!label || pairs.has(label)) return;

    const home = parseStatNumber($tr.find('td.Opta-Home').text());
    const away = parseStatNumber($tr.find('td.Opta-Away').text());
    if (home !== null && away !== null) pairs.set(label, [home, away]);
  });

  return pairs;
}

export async function fetchMatchFacts(
  competitionId: string,
  seasonId: string,
  matchId: string
): Promise<MatchFactsPayload> {
  const url = matchCentreUrl(competitionId, seasonId, matchId);
  const html = await fetchRenderedHtml(url, {
    waitForSelector: 'table.Opta-Stats-Bars, table.Opta-shotoverview',
    timeoutMs: 20_000,
  });
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const pairs = extractLabelPairs($);
  if (pairs.size === 0) {
    throw new Error(
      `theanalyst match centre: no stat rows found — no data for this match yet, or layout drift? (${url})`
    );
  }

  const home = emptySide();
  const away = emptySide();
  const claimed = new Set<string>();

  for (const [column, labels] of Object.entries(STAT_LABELS) as [keyof Omit<SideStats, 'raw_stats'>, string[]][]) {
    for (const label of labels) {
      const pair = pairs.get(label);
      if (!pair) continue;
      // Every mapped column but xg/pass_accuracy is an `int` in opta_match_facts
      // (migration 20260824000001), but theanalyst reports possession with a
      // decimal ("64.1") — round rather than let the upsert reject the whole
      // row with "invalid input syntax for type integer".
      const round = column !== 'xg' && column !== 'pass_accuracy';
      home[column] = round ? Math.round(pair[0]) : pair[0];
      away[column] = round ? Math.round(pair[1]) : pair[1];
      claimed.add(label);
      break;
    }
  }

  // Everything else the page reported goes into raw_stats verbatim.
  for (const [label, [h, a]] of pairs) {
    if (claimed.has(label)) continue;
    home.raw_stats[label] = h;
    away.raw_stats[label] = a;
  }

  return { home, away };
}
