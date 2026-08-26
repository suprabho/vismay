/**
 * theanalyst.com Opta match-centre scraper — per-match stats for both sides,
 * plus (UNVERIFIED, see the match-events section below) the match timeline.
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

/** One timeline event parsed off the match-centre widget, normalized to the
 *  `fixture_events` vocabulary (types + detail spellings the MatchTimeline
 *  renderer's regexes expect — see verticals/footshorts-viz MatchTimeline). */
export type MatchEvent = {
  side: 'home' | 'away';
  /** "45+2'" → minute 45, extraMinute 2. */
  minute: number;
  extraMinute: number | null;
  type: 'goal' | 'card' | 'subst' | 'var';
  /** API-Football-style spelling: Normal Goal | Own Goal | Penalty |
   *  Yellow Card | Red Card | Substitution | Missed Penalty. */
  detail: string | null;
  playerName: string | null;
  /** Assister (goal) / player coming ON (subst). */
  assistName: string | null;
};

export type MatchCentreData = MatchFactsPayload & { events: MatchEvent[] };

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

// ── match events (timeline) ──────────────────────────────────────────────────
//
// ⚠️ UNVERIFIED SELECTORS — authored without site access (this sandbox can't
// reach theanalyst.com), the same starting point the stats parser above had
// before its 2026-08-24 live pass proved two assumptions wrong. Everything
// below is a deliberately-isolated best guess: run the match-facts workflow
// with dump_events=true, read `dumpUnparsedOptaRegions`' output in the CI log,
// and rewrite `extractMatchEvents` against the real widget DOM
// (docs/theanalyst-scraping.md tracks verification state). Extraction failures
// are contained by the caller — stats scraping is never affected.

/** "45+2'" / "90 +4" / "12'" → { minute, extraMinute }; null when no digits. */
export function parseEventMinute(raw: string): { minute: number; extraMinute: number | null } | null {
  const m = raw.match(/(\d{1,3})\s*(?:\+\s*(\d{1,2}))?\s*[''′]?/);
  if (!m || !m[1]) return null;
  const minute = Number(m[1]);
  if (!Number.isFinite(minute) || minute > 130) return null;
  const extra = m[2] ? Number(m[2]) : null;
  return { minute, extraMinute: extra != null && Number.isFinite(extra) ? extra : null };
}

/** Classify an event row from its class names + text. Returns the normalized
 *  type/detail pair, or null when the haystack matches nothing event-like.
 *  Order matters: "own goal"/"penalty" both contain "goal"; missed penalties
 *  must never land as goals (the timeline would render a phantom scorer). */
function classifyEvent(haystack: string): { type: MatchEvent['type']; detail: string | null } | null {
  const h = haystack.toLowerCase();
  if (/own[\s-]?goal/.test(h)) return { type: 'goal', detail: 'Own Goal' };
  if (/pen/.test(h) && /(miss|sav|fail)/.test(h)) return { type: 'var', detail: 'Missed Penalty' };
  if (/(penalty|\(pen\)|\bpen\b)/.test(h)) return { type: 'goal', detail: 'Penalty' };
  if (/(goal|scor)/.test(h)) return { type: 'goal', detail: 'Normal Goal' };
  // Any second-yellow/dismissal signal maps to 'Red Card' (diverging from
  // API-Football's 'Second Yellow card' on purpose: the renderer colors by
  // /red/i, and a second yellow should show as a red).
  if (/(red[\s-]?card|second[\s-]?yellow|sent[\s-]?off|dismiss|\bred\b)/.test(h)) {
    return { type: 'card', detail: 'Red Card' };
  }
  if (/(yellow|card|book)/.test(h)) return { type: 'card', detail: 'Yellow Card' };
  if (/sub/.test(h)) return { type: 'subst', detail: 'Substitution' };
  if (/\bvar\b/.test(h)) return { type: 'var', detail: null };
  return null;
}

/** Home/away from Opta's class conventions (the stats tables use
 *  Opta-Home/Opta-Away cells). Takes plain class strings — row's own +
 *  ancestors' first, then descendants' — first hit wins. */
function sideFromClassLists(classes: string[]): 'home' | 'away' | null {
  for (const cls of classes) {
    if (/home/i.test(cls)) return 'home';
    if (/away/i.test(cls)) return 'away';
  }
  return null;
}

/** Pull a player (and assist / player-on) out of an event row's text after
 *  stripping minute tokens, parentheticals, and event keywords. Word-boundary
 *  replaces so names like "Cardoso" survive the "card" strip. */
function extractNames(text: string): { player: string | null; assist: string | null } {
  const flat = text.replace(/\s+/g, ' ').trim();
  const assist = flat.match(/assist(?:ed by)?[:\s]+([^()|,;]+)/i)?.[1]?.trim() ?? null;
  const playerOn = flat.match(/\b(?:on|in)[:\s]+([^()|,;]+)/i)?.[1]?.trim() ?? null;
  let t = flat
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d{1,3}\s*(?:\+\s*\d{1,2})?\s*[''′]?/g, ' ')
    .replace(/\b(own goal|goal|penalty|pen|yellow|red|card|second|substitution|sub|assist(?:ed by)?|off|on|var|missed|scored?)\b/gi, ' ')
    .replace(/[|·•:,;–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { player: t || null, assist: assist ?? playerOn };
}

// Containers a timeline/events sub-widget plausibly lives in. Classic Opta
// widgets are all `Opta-*`-classed; the real name comes from the CI dump.
const EVENT_CONTAINER_SELECTOR = [
  '[class*="Opta-MatchEvents"]',
  '[class*="Opta-Match-Events"]',
  '[class*="Opta-Events"]',
  '[class*="Opta-Event"]',
  '[class*="Opta-Timeline"]',
  '[class*="Opta-Key-Events"]',
  '[class*="Opta-Commentary"]',
].join(', ');

/**
 * Best-guess event extraction (UNVERIFIED — see the section banner). Scans
 * candidate event containers for rows carrying a parseable minute, classifies
 * each from its class names + text, and resolves the side from Opta's
 * home/away class conventions. Rows missing a minute, a classification, or a
 * side are skipped (the write path can't use them) and counted in a warning.
 */
export function extractMatchEvents($: cheerio.CheerioAPI): MatchEvent[] {
  const events: MatchEvent[] = [];
  let skipped = 0;
  const seenRows = new Set<unknown>();

  $(EVENT_CONTAINER_SELECTOR).each((_, container) => {
    $(container)
      .find('li, tr')
      .each((__, row) => {
        if (seenRows.has(row)) return; // overlapping container selectors
        seenRows.add(row);
        if ($(row).find('li, tr').length > 0) return; // only leaf rows

        const text = $(row).text().replace(/\s+/g, ' ').trim();
        if (!text) return;
        const minute = parseEventMinute(text);
        if (!minute) return; // not an event row (headers, team names, …)

        const selfAndAncestorClasses: string[] = [];
        {
          let cur = $(row);
          for (let i = 0; i < 6 && cur.length; i++) {
            const cls = cur.attr('class');
            if (cls) selfAndAncestorClasses.push(cls);
            cur = cur.parent();
          }
        }
        const descendantClasses = $(row)
          .find('[class]')
          .toArray()
          .map((n) => $(n).attr('class') ?? '');

        const kind = classifyEvent(`${selfAndAncestorClasses[0] ?? ''} ${descendantClasses.join(' ')} ${text}`);
        if (!kind) return;

        const side = sideFromClassLists([...selfAndAncestorClasses, ...descendantClasses]);
        if (!side) {
          skipped++;
          return;
        }

        const { player, assist } = extractNames(text);
        events.push({
          side,
          minute: minute.minute,
          extraMinute: minute.extraMinute,
          type: kind.type,
          detail: kind.detail,
          playerName: player,
          assistName: assist,
        });
      });
  });

  if (skipped > 0) {
    console.warn(`[match-centre] ${skipped} event row(s) skipped (no home/away side resolved)`);
  }
  return events;
}

/**
 * Selector-debugging aid for the CI loop (workflow input dump_events=true):
 * an inventory of every Opta-ish class token on the page, plus a text peek at
 * each top-level Opta region OUTSIDE the two parsed stats tables — enough to
 * read the real event-widget structure straight out of the workflow log
 * without shipping page HTML.
 */
export function dumpUnparsedOptaRegions($: cheerio.CheerioAPI): string {
  const lines: string[] = [];

  const counts = new Map<string, number>();
  $('[class*="Opta"], [class*="opta"]').each((_, el) => {
    for (const token of ($(el).attr('class') ?? '').split(/\s+/)) {
      if (/opta/i.test(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  });
  lines.push(`[dump] ${counts.size} distinct Opta class token(s):`);
  for (const [token, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${n}× ${token}`);
  }

  const regions = $('[class*="Opta"]')
    .toArray()
    .filter(
      (el) =>
        $(el).closest('table.Opta-Stats-Bars, table.Opta-shotoverview').length === 0 &&
        $(el).parents('[class*="Opta"]').length === 0
    );
  lines.push(`[dump] ${regions.length} top-level Opta region(s) outside the stats tables:`);
  for (const el of regions.slice(0, 15)) {
    const cls = ($(el).attr('class') ?? '').trim();
    const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 500);
    lines.push(`  <${'tagName' in el ? (el as { tagName: string }).tagName : '?'} class="${cls}"> ${text}`);
  }
  if (regions.length > 15) lines.push(`  … ${regions.length - 15} more region(s) elided`);

  return lines.join('\n');
}

export async function fetchMatchFacts(
  competitionId: string,
  seasonId: string,
  matchId: string,
  opts?: { dumpEvents?: boolean }
): Promise<MatchCentreData> {
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

  // Timeline events from the SAME render — zero extra page fetches. Extraction
  // is isolated: a selector failure here (the events parser is still
  // unverified, see the section banner above) degrades to an empty list and
  // can never break the stats scrape.
  let events: MatchEvent[] = [];
  try {
    events = extractMatchEvents($);
  } catch (e) {
    console.warn(
      `[match-centre] event extraction failed (stats unaffected): ${(e as Error).message} (${url})`
    );
  }
  if (opts?.dumpEvents) {
    console.log(`[match-centre] ${url}\n[match-centre] parsed ${events.length} event(s): ${JSON.stringify(events)}`);
    console.log(dumpUnparsedOptaRegions($));
  }

  return { home, away, events };
}
