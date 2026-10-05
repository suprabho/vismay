/**
 * theanalyst.com Opta match-centre scraper — per-match stats for both sides,
 * the match timeline (see the match-events section below), and the Opta-OS
 * narrative feed (commentary + insights; see extractMatchStories). All three
 * come out of ONE page render.
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

/**
 * The widget's own scoreboard (`table.Opta-MatchHeader-Crested`, verified
 * live 2026-09-09): team names, full-time + half-time score, competition
 * name and the match date. This is what lets a pasted match-centre URL be
 * scraped WITHOUT already knowing which fixtures row it belongs to
 * (theanalystMatchFacts.ts --url mode matches these against fixtures by
 * team names + date, the same way discovery does).
 */
export type MatchHeader = {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  homeHtScore: number | null;
  awayHtScore: number | null;
  /** e.g. "UEFA Champions League" — Opta's display name, not our slug. */
  competitionName: string | null;
  /** YYYY-MM-DD, parsed from "Tuesday 8 September 2026"; null if unparseable. */
  matchDate: string | null;
};

/**
 * One card from the match centre's narrative panel — the `Opta-OS` widget that
 * sits beside the stat tables (its tab bar reads Commentary / Chalkboard /
 * Pass Map / xG Map). The feed mixes Opta's minute-by-minute COMMENTARY with
 * its INSIGHTS: season-context nuggets ("Valencia have attempted 22 shots in
 * this game, their highest total in a single match in the Primera División this
 * season") that no other source we hold can produce.
 *
 * VERIFIED LIVE (2026-10-03) against Valencia 2-3 Real Sociedad: 116 cards —
 * 97 commentary, 16 insights, 2 pre-match insights, 1 match preview.
 */
export type MatchStory = {
  /** Document order among the CAPTURED cards (dense, 0-based), newest first —
   *  not the raw DOM index; see the push site in extractMatchStories. */
  seq: number;
  kind: 'commentary' | 'insight' | 'pre_match_insight' | 'match_preview';
  /** Null on the build-up cards, which carry no clock. */
  minute: number | null;
  extraMinute: number | null;
  /** Resolved from the card's crest against the scoreboard's two crests. */
  side: 'home' | 'away' | null;
  body: string;
};

export type MatchCentreData = MatchFactsPayload & {
  events: MatchEvent[];
  stories: MatchStory[];
  header: MatchHeader | null;
};

export type MatchCentreIds = { competitionId: string; seasonId: string; matchId: string };

export function matchCentreUrl(competitionId: string, seasonId: string, matchId: string): string {
  const params = new URLSearchParams({ competitionId, seasonId, matchId });
  return `https://dataviz.theanalyst.com/opta-football-match-centre/?${params}`;
}

/**
 * Pulls the id triple out of any theanalyst.com match URL — the human
 * wrapper page (`theanalyst.com/opta-football-match-centre?…`, what the
 * site's own fixture tiles and a person's address bar carry) or the dataviz
 * widget URL above. Path/param order don't matter; null unless all three
 * ids are present. Mirror of parseTheanalystMatchUrl in
 * packages/content-source/src/footshortsData.ts (the admin side) — the
 * worker has no dependency on that package, so keep both in sync.
 */
export function parseMatchCentreUrl(raw: string): MatchCentreIds | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!url.hostname.endsWith('theanalyst.com')) return null;
  const matchId = url.searchParams.get('matchId');
  const competitionId = url.searchParams.get('competitionId');
  const seasonId = url.searchParams.get('seasonId');
  if (!matchId || !competitionId || !seasonId) return null;
  return { matchId, competitionId, seasonId };
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "Tuesday 8 September 2026" → "2026-09-08". */
export function parseHeaderDate(raw: string): string | null {
  const m = raw.replace(/\s+/g, ' ').trim().match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const [, day, monthName, year] = m ?? [];
  if (!day || !monthName || !year) return null;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function headerScore(raw: string): number | null {
  const n = Number(raw.replace(/\u00a0/g, ' ').trim());
  return Number.isFinite(n) && raw.trim() !== '' ? n : null;
}

/**
 * Scoreboard parser. The widget renders TWO `table.Opta-MatchHeader`s: the
 * crested one (with competition/date details and real scores) and a plain
 * sticky copy whose scores are blank until scrolled — so prefer the crested
 * table and fall back to the first table carrying both team names.
 */
export function extractMatchHeader($: cheerio.CheerioAPI): MatchHeader | null {
  const tables = $('table.Opta-MatchHeader').toArray();
  const table =
    tables.find((t) => $(t).hasClass('Opta-MatchHeader-Crested')) ??
    tables.find((t) => $(t).find('td.Opta-TeamName').length >= 2);
  if (!table) return null;
  const $t = $(table);

  const teamName = (side: 'Home' | 'Away') =>
    $t.find(`td.Opta-TeamName.Opta-${side}`).first().text().replace(/\s+/g, ' ').trim();
  const homeTeamName = teamName('Home');
  const awayTeamName = teamName('Away');
  if (!homeTeamName || !awayTeamName) return null;

  const score = (side: 'Home' | 'Away') =>
    headerScore($t.find(`td.Opta-Score.Opta-${side} .Opta-Team-Score`).first().text());

  // "HT 1-0" — abbr text + score; only the digits matter.
  const ht = $t.find('tr.Opta-Score-Extras').text().match(/(\d+)\s*-\s*(\d+)/);

  const competitionName = $t.find('.Opta-Competition').first().text().replace(/\s+/g, ' ').trim() || null;
  const dateRaw = $t.find('.Opta-Date').first().text();

  return {
    homeTeamName,
    awayTeamName,
    homeScore: score('Home'),
    awayScore: score('Away'),
    homeHtScore: ht ? Number(ht[1]) : null,
    awayHtScore: ht ? Number(ht[2]) : null,
    competitionName,
    matchDate: dateRaw ? parseHeaderDate(dateRaw) : null,
  };
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

/** The card type label the widget prints → our `kind`. Unknown labels are
 *  skipped rather than guessed at, so a new card type can't land as commentary. */
const STORY_KINDS: Record<string, MatchStory['kind']> = {
  COMMENTARY: 'commentary',
  INSIGHTS: 'insight',
  'PRE MATCH INSIGHTS': 'pre_match_insight',
  'MATCH PREVIEW': 'match_preview',
};

/** The Opta team id inside a crest image URL (`…&id=<optaTeamId>`). */
function crestTeamId($img: cheerio.Cheerio<never>): string | null {
  const src = $img.attr('src') ?? '';
  return /[?&]id=([^&]+)/.exec(src)?.[1] ?? null;
}

/**
 * Commentary + insights from the `Opta-OS` card feed.
 *
 * Each card is `.Opta-OS-Card` with a `.Opta-OS-Card-Type-Label` ("COMMENTARY"
 * / "INSIGHTS"), a `.Opta-OS-Card-Time` clock, a `.Opta-OS-Card-Crest` image
 * whose URL carries the Opta team id, and `.Opta-OS-Card-Text` prose. Sides are
 * resolved by matching that team id against the scoreboard's own two crests
 * (`table.Opta-MatchHeader-Crested`, home first) — the cards themselves carry
 * no home/away class.
 *
 * Returns [] rather than throwing: this panel is a bonus beside the stats, and
 * a layout change here must never cost us a match's numbers.
 */
export function extractMatchStories($: cheerio.CheerioAPI): MatchStory[] {
  const cards = $('.Opta-OS-Card').toArray();
  if (cards.length === 0) return [];

  // Scoreboard crests in document order: [0] home, [1] away (verified live,
  // and corroborated by the Opta-Home / Opta-Away classes on the same cells).
  const headerIds = $('table.Opta-MatchHeader-Crested img')
    .toArray()
    .map((el) => crestTeamId($(el) as never))
    .filter((id): id is string => !!id);
  const sideFor = (teamId: string | null): MatchStory['side'] => {
    if (!teamId) return null;
    if (teamId === headerIds[0]) return 'home';
    if (teamId === headerIds[1]) return 'away';
    return null;
  };

  const out: MatchStory[] = [];
  // Count skips BY REASON, naming the labels: "20 skipped" alone can't tell a
  // card type we failed to map (fixable) from a genuinely text-less card like a
  // lineup or video tile (correctly ignored).
  const unmapped = new Map<string, number>();
  let empty = 0;
  cards.forEach((el) => {
    const $c = $(el);
    const label = $c.find('.Opta-OS-Card-Type-Label').first().text().replace(/\s+/g, ' ').trim().toUpperCase();
    const kind = STORY_KINDS[label];
    const body = $c.find('.Opta-OS-Card-Text').first().text().replace(/\s+/g, ' ').trim();
    if (!kind) {
      unmapped.set(label || '(no label)', (unmapped.get(label || '(no label)') ?? 0) + 1);
      return;
    }
    if (!body) {
      empty++;
      return;
    }
    const clock = parseEventMinute($c.find('.Opta-OS-Card-Time').first().text());
    out.push({
      // Dense, assigned AFTER the skips — never the raw card index. The writer
      // prunes a shrunken feed with `delete … where seq >= rows.length`, which
      // silently deletes live rows if these numbers have gaps.
      seq: out.length,
      kind,
      minute: clock?.minute ?? null,
      extraMinute: clock?.extraMinute ?? null,
      side: sideFor(crestTeamId($c.find('.Opta-OS-Card-Crest img').first() as never)),
      body,
    });
  });
  if (unmapped.size > 0) {
    const detail = [...unmapped.entries()].map(([l, n]) => `${n}× "${l}"`).join(', ');
    console.warn(`[match-centre] narrative cards with an unmapped type label: ${detail}`);
  }
  if (empty > 0) {
    console.warn(`[match-centre] ${empty} narrative card(s) skipped (no text — lineup/media tile)`);
  }
  return out;
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
    // The Opta-OS narrative widget mounts AFTER the stats tables, so a capture
    // taken the moment the stats appear usually has no cards at all (run 1 of
    // the backfill stored cards for 3 of 20 matches). Best-effort: a page that
    // genuinely has no narrative feed still yields its stats and timeline.
    settleSelector: '.Opta-OS-Card',
    settleTimeoutMs: 8_000,
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
  // Commentary + insights from the SAME render, isolated the same way: a
  // selector failure here logs and yields [], never touching the stats.
  let stories: MatchStory[] = [];
  try {
    stories = extractMatchStories($);
  } catch (e) {
    console.warn(
      `[match-centre] story extraction failed (stats unaffected): ${(e as Error).message} (${url})`
    );
  }

  if (opts?.dumpEvents) {
    console.log(`[match-centre] ${url}\n[match-centre] parsed ${events.length} event(s): ${JSON.stringify(events)}`);
    console.log(dumpUnparsedOptaRegions($));
  }

  // Scoreboard — same isolation as events: a header-selector failure logs
  // and yields null, never blocks the stats.
  let header: MatchHeader | null = null;
  try {
    header = extractMatchHeader($);
  } catch (e) {
    console.warn(`[match-centre] header extraction failed (stats unaffected): ${(e as Error).message} (${url})`);
  }

  return { home, away, events, stories, header };
}
