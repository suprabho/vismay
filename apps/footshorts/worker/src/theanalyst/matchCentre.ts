/**
 * theanalyst.com Opta match-centre scraper — per-match stats for both sides.
 *
 * The match centre addresses a match as
 *   /opta-football-match-centre?competitionId=<id>&seasonId=<id>&matchId=<id>
 * (opaque string ids). Stats are extracted label-driven: for each known Opta
 * stat label we look for a DOM row containing that label plus two numbers
 * (home value first, away value second — the standard match-centre layout).
 * Labels we don't model as columns still land in raw_stats.
 *
 * Deterministic parsing, no LLM — the page is numeric data.
 *
 * SELECTOR CAVEAT: written without network access to theanalyst.com. The
 * label-row heuristic avoids depending on class names, but the label spellings
 * and home/away ordering MUST be verified against a live match page before
 * production (docs/theanalyst-scraping.md checklist). If the page turns out to
 * be fully JS-rendered, this needs a headless-browser fetch (see the doc).
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetch';

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
  return `https://theanalyst.com/opta-football-match-centre?${params}`;
}

/** Column name → label spellings to try, most specific first. Verify against
 *  the live page and extend as the real labels are confirmed. */
const STAT_LABELS: Record<keyof Omit<SideStats, 'raw_stats'>, string[]> = {
  xg: ['expected goals (xg)', 'expected goals', 'xg'],
  shots: ['total shots', 'shots'],
  shots_on_target: ['shots on target'],
  possession: ['possession'],
  passes: ['total passes', 'passes'],
  pass_accuracy: ['pass accuracy', 'passing accuracy'],
  big_chances: ['big chances created', 'big chances'],
  big_chances_missed: ['big chances missed'],
  corners: ['corners'],
  fouls: ['fouls committed', 'fouls'],
  yellow_cards: ['yellow cards'],
  red_cards: ['red cards'],
  offsides: ['offsides'],
};

const NUMBER_RE = /-?\d+(?:\.\d+)?%?/g;

function emptySide(): SideStats {
  return {
    xg: null, shots: null, shots_on_target: null, possession: null, passes: null,
    pass_accuracy: null, big_chances: null, big_chances_missed: null, corners: null,
    fouls: null, yellow_cards: null, red_cards: null, offsides: null, raw_stats: {},
  };
}

/**
 * Find each stat label's smallest enclosing "row": the nearest ancestor whose
 * text contains the label AND at least two numbers. Returns [home, away] as
 * the first two numbers in row order.
 */
function extractLabelPairs($: cheerio.CheerioAPI): Map<string, [number, number]> {
  const pairs = new Map<string, [number, number]>();

  $('*').each((_, el) => {
    const node = $(el);
    if (node.children().length > 0) return; // leaves only — labels are text nodes
    const label = node.text().replace(/\s+/g, ' ').trim().toLowerCase();
    if (!label || label.length > 40 || pairs.has(label)) return;
    if (NUMBER_RE.test(label)) { NUMBER_RE.lastIndex = 0; return; } // labels are non-numeric
    NUMBER_RE.lastIndex = 0;

    // Walk up until the enclosing element's text holds ≥2 numbers besides the label.
    let ancestor = node.parent();
    for (let depth = 0; ancestor.length && depth < 4; depth++) {
      const rowText = ancestor.text().replace(/\s+/g, ' ').trim();
      const withoutLabel = rowText.toLowerCase().split(label).join(' ');
      const nums = withoutLabel.match(NUMBER_RE)?.map((n) => Number(n.replace('%', ''))) ?? [];
      // Rows are small; a huge container means we walked past the stat row.
      if (rowText.length > 200) break;
      const [homeVal, awayVal] = nums;
      if (homeVal !== undefined && awayVal !== undefined && nums.every((n) => Number.isFinite(n))) {
        pairs.set(label, [homeVal, awayVal]);
        break;
      }
      ancestor = ancestor.parent();
    }
  });

  return pairs;
}

export async function fetchMatchFacts(
  competitionId: string,
  seasonId: string,
  matchId: string
): Promise<MatchFactsPayload> {
  const url = matchCentreUrl(competitionId, seasonId, matchId);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const pairs = extractLabelPairs($);
  if (pairs.size === 0) {
    throw new Error(
      `theanalyst match centre: no stat rows found — JS-rendered page or selector drift? (${url})`
    );
  }

  const home = emptySide();
  const away = emptySide();
  const claimed = new Set<string>();

  for (const [column, labels] of Object.entries(STAT_LABELS) as [keyof Omit<SideStats, 'raw_stats'>, string[]][]) {
    for (const label of labels) {
      const pair = pairs.get(label);
      if (!pair) continue;
      home[column] = pair[0];
      away[column] = pair[1];
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
