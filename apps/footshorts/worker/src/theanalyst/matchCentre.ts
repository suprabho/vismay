/**
 * theanalyst.com Opta match-centre scraper — per-match stats for both sides,
 * plus the match timeline (see the match-events section below).
 *
 * VERIFIED LIVE (2026-08-24, timeline 2026-08-26) against a real finished
 * match. Two things were wrong in the original (authored without site
 * access) version:
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
// Verified live 2026-08-26 against a finished La Liga match (Atlético 2-2
// Villarreal): the timeline is two `<ul class="Opta-Events Opta-Home|Away">`
// lists of `<li class="Opta-MatchEvent">`, each carrying `.Opta-Event-Title` /
// `.Opta-Event-Min` and a tooltip body with the player name(s). Simultaneous
// substitutions collapse into ONE `<li>` with a `.Opta-groupcount` badge and
// one `.Opta-EventGroup-TooltipContent` per bundled sub — each must be read as
// its own event or they garble together into one row (docs/theanalyst-scraping.md
// fragility table has the full DOM shape).

/** "45+2'" / "90 +4" / "12'" → { minute, extraMinute }; null when no digits.
 *  Opta wraps the digits/"+" in invisible Unicode format characters (bidi
 *  control marks) that `\s` doesn't match — left in place they silently sit
 *  between "90" and "+", breaking the "+N" extra-time capture even though the
 *  digits themselves still match. Strip all format chars (`\p{Cf}`) first. */
export function parseEventMinute(raw: string): { minute: number; extraMinute: number | null } | null {
  const cleaned = raw.replace(/\p{Cf}/gu, '');
  const m = cleaned.match(/(\d{1,3})\s*(?:\+\s*(\d{1,2}))?\s*[''′]?/);
  if (!m || !m[1]) return null;
  const minute = Number(m[1]);
  if (!Number.isFinite(minute) || minute > 130) return null;
  const extra = m[2] ? Number(m[2]) : null;
  return { minute, extraMinute: extra != null && Number.isFinite(extra) ? extra : null };
}

/** Classify an event from its `.Opta-Event-Title` text ("Goal", "Penalty
 *  scored", "Yellow card", "Substitution", …). Returns the normalized
 *  type/detail pair, or null when the title matches nothing event-like.
 *  Order matters: "own goal"/"penalty" both contain "goal"; missed penalties
 *  must never land as goals (the timeline would render a phantom scorer). */
function classifyEvent(title: string): { type: MatchEvent['type']; detail: string | null } | null {
  const h = title.toLowerCase();
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

/** Text of the first element matching `selector` inside `$el`, with any
 *  nested icon glyph stripped (icon `<span>`s carry no text, but stripping
 *  keeps this robust to markup drift) and whitespace collapsed. */
function textOf($el: cheerio.Cheerio<any>, selector: string): string | null {
  const $found = $el.find(selector).first();
  if (!$found.length) return null;
  const text = $found.clone().find('.Opta-Icon').remove().end().text().replace(/\s+/g, ' ').trim();
  return text || null;
}

/** Substitution names live as two `<p>` tags, each holding a name followed by
 *  an Off/On icon glyph — `playerName` is the player coming OFF, `assistName`
 *  the player coming ON (matches API-Football's subst convention, which
 *  MatchTimeline renders as the primary line and the "on: …" line). */
function extractSubstitutionNames($container: cheerio.Cheerio<any>): { player: string | null; assist: string | null } {
  return {
    player: textOf($container, 'p:has(.Opta-IconOff)'),
    assist: textOf($container, 'p:has(.Opta-IconOn)'),
  };
}

/** Goal/card/var tooltips hold the player as a plain `<div><p>Name</p></div>`
 *  and, for goals, an optional `<div><p class="Opta-assist">Assist: X</p></div>`
 *  sibling — cards have a same-shaped but always-empty `.Opta-Event-Reason`
 *  sibling instead, so excluding both from the player-div search leaves only
 *  the name. */
function extractPlayerAndAssist($container: cheerio.Cheerio<any>): { player: string | null; assist: string | null } {
  const assist = textOf($container, '.Opta-assist')?.replace(/^assist:?\s*/i, '').trim() || null;
  const player = textOf($container, '> div:not(:has(.Opta-assist)):not(:has(.Opta-Event-Reason))');
  return { player, assist };
}

/**
 * Reads the two `<ul class="Opta-Events Opta-Home|Opta-Away">` timeline lists
 * (verified live 2026-08-26 — see the section banner). Each `<li class="Opta-
 * MatchEvent">` carries `.Opta-Event-Title` + `.Opta-Event-Min`; simultaneous
 * substitutions bundle into one `<li>` with one `.Opta-EventGroup-
 * TooltipContent` per sub, each split back out into its own event. Rows
 * missing a title or a parseable minute are skipped and counted in a warning
 * (the half/full-time "Whistle" markers in the separate `.Opta-Timeline` div
 * are never matched — they're not inside either `Opta-Events` list).
 */
export function extractMatchEvents($: cheerio.CheerioAPI): MatchEvent[] {
  const events: MatchEvent[] = [];
  let skipped = 0;

  (['home', 'away'] as const).forEach((side) => {
    const sideClass = side === 'home' ? 'Opta-Home' : 'Opta-Away';
    $(`ul.Opta-Events.${sideClass} > li.Opta-MatchEvent`).each((_, li) => {
      const $li = $(li);
      const title = textOf($li, '.Opta-Event-Title');
      const minuteText = $li.find('.Opta-Event-Min').first().text();
      const minute = title ? parseEventMinute(minuteText) : null;
      const kind = title ? classifyEvent(title) : null;
      if (!title || !minute || !kind) {
        skipped++;
        return;
      }

      const groups = $li.find('.Opta-EventGroup-TooltipContent');
      const namesFor = kind.type === 'subst' ? extractSubstitutionNames : extractPlayerAndAssist;
      const sources = groups.length > 0 ? groups.toArray().map((g) => $(g)) : [$li.find('.Opta-Hidden').first()];

      for (const $source of sources) {
        const { player, assist } = namesFor($source);
        events.push({
          side,
          minute: minute.minute,
          extraMinute: minute.extraMinute,
          type: kind.type,
          detail: kind.detail,
          playerName: player,
          assistName: assist,
        });
      }
    });
  });

  if (skipped > 0) {
    console.warn(`[match-centre] ${skipped} event row(s) skipped (no title/minute parsed)`);
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
