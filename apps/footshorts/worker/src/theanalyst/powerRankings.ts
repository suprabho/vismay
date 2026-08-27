/**
 * theanalyst.com Opta Power Rankings parser.
 *
 * VERIFIED LIVE (2026-08-24): the article page
 * (theanalyst.com/articles/who-are-the-best-football-team-in-the-world-opta-power-rankings)
 * only carries the narrative prose in its own DOM. The ranked list itself is
 * a separate widget app embedded via a cross-origin
 * `<iframe src="https://dataviz.theanalyst.com/opta-power-rankings/">` —
 * invisible to page.content() on the article, regardless of wait strategy.
 * So this fetches TWO pages: the article (title/publishedAt/narrative) and
 * the widget iframe's own URL (the ranked table), located by reading the
 * article's iframe `src` (DEFAULT_WIDGET_URL is the fallback if that lookup
 * ever fails). The widget's copy says it "updates daily Monday to Friday" —
 * not weekly as originally assumed; the cron cadence reflects that now.
 *
 * The ranked team list is structured content (a real <table>/<thead>/<tbody>
 * in the widget), so it's extracted deterministically with cheerio (no LLM —
 * same reasoning as the squads wikipedia adapter's table parsing: structured
 * data plus an LLM is just added cost and hallucination surface). The
 * surrounding article prose is NOT parsed here beyond plain-text extraction;
 * the entry script (theanalystPowerRankings.ts) summarizes it with Gemini so
 * we store a short abstractive summary, never the full article text.
 *
 * SELECTOR CAVEAT: three extraction strategies are tried in order (table
 * rows → ordered-list items → "N. Team" text lines). The table strategy's
 * header-text column mapping (rank/team/rating/change) is verified against
 * the live widget; the other two strategies are still unverified fallbacks
 * for if the widget's markup changes shape (docs/theanalyst-scraping.md
 * checklist). Both fetches go through fetchRenderedHtml (headless Chromium)
 * — confirmed empty via plain fetch for both the article's widget content
 * and the widget page itself.
 */

import * as cheerio from 'cheerio';
import { fetchRenderedHtml } from './fetch';

export type RankingEntry = {
  rank: number;
  team_name: string;
  /** entities(id) — resolved by the entry script, null when the resolver missed. */
  resolved_entity_id: string | null;
  /** Opta's power-ranking rating for the team, when shown. */
  score: number | null;
  /** Places moved since last week (+ up / - down), when shown. */
  movement: number | null;
  competition: string | null;
};

export type PowerRankingsPage = {
  rankings: RankingEntry[];
  /** Article prose (plain text) — Gemini input only, never stored verbatim. */
  narrativeText: string;
  title: string;
  publishedAt: string | null;
};

function toNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const stripped = raw.replace(/[^\d.+-]/g, '');
  // Number('') is 0, not NaN — without this check every non-numeric string
  // with zero digits (e.g. any team name) silently parses as 0 instead of
  // failing, which breaks every "is this a number, not a name" guard below.
  if (!/\d/.test(stripped)) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

function parseMovement(raw: string): number | null {
  // "▲ 3" / "+3" / "up 3" → 3; "▼ 2" / "-2" / "down 2" → -2; "–" / "=" → 0
  const m = raw.match(/([▲▼+-]|\bup\b|\bdown\b)\s*(\d+)/i);
  const direction = m?.[1];
  const amount = m?.[2];
  if (!direction || !amount) return /^[=–—-]$/.test(raw.trim()) ? 0 : null;
  const n = Number(amount);
  return /[▼-]|down/i.test(direction) ? -n : n;
}

/**
 * Strategy 1: a rankings table. Columns are identified by header text
 * (thead th: "rank" / "team" / "rating" / "ranking change ...") when present
 * — verified live against the dataviz widget's table, which reports rating
 * and 7-day change as separate plain columns, not a combined last cell. When
 * no thead is found, falls back to the original positional guess (rank in
 * cell 0, team in cell 1, score in the last cell) for resilience against a
 * differently-shaped table.
 */
function fromTables($: cheerio.CheerioAPI): RankingEntry[] {
  const entries: RankingEntry[] = [];
  $('table').each((_, table) => {
    if (entries.length) return; // first plausible table wins
    const $table = $(table);

    const headerCells = $table
      .find('thead th')
      .map((_, th) => $(th).text().replace(/\s+/g, ' ').trim().toLowerCase())
      .get();
    const col = {
      rank: headerCells.indexOf('rank'),
      team: headerCells.indexOf('team'),
      rating: headerCells.findIndex((h) => h.includes('rating') || h === 'score'),
      change: headerCells.findIndex((h) => h.includes('change') || h.includes('movement')),
    };
    const hasHeaders = col.rank >= 0 && col.team >= 0;

    const $rows = $table.find('tbody tr').length ? $table.find('tbody tr') : $table.find('tr');
    const rows: RankingEntry[] = [];
    $rows.each((_, tr) => {
      const cells = $(tr)
        .find('td, th')
        .map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
        .get();
      if (cells.length < 2) return;

      const rankIdx = hasHeaders ? col.rank : 0;
      const teamIdx = hasHeaders ? col.team : 1;
      const rank = toNumber(cells[rankIdx]);
      if (rank === null || !Number.isInteger(rank) || rank < 1 || rank > 500) return;
      const team = cells[teamIdx];
      if (!team || toNumber(team) !== null) return; // must be a name, not another number

      rows.push({
        rank,
        team_name: team,
        resolved_entity_id: null,
        score:
          hasHeaders && col.rating >= 0
            ? toNumber(cells[col.rating])
            : cells.length > 2
              ? toNumber(cells[cells.length - 1])
              : null,
        movement:
          hasHeaders && col.change >= 0
            ? toNumber(cells[col.change]) // widget reports a plain signed int, not arrows
            : cells.length > 3
              ? parseMovement(cells[2] ?? '')
              : null,
        competition: null,
      });
    });
    if (rows.length >= 10) entries.push(...rows);
  });
  return entries;
}

/** Strategy 2: an <ol> where each <li> is one team. */
function fromOrderedLists($: cheerio.CheerioAPI): RankingEntry[] {
  const entries: RankingEntry[] = [];
  $('ol').each((_, ol) => {
    if (entries.length) return;
    const rows: RankingEntry[] = [];
    $(ol)
      .children('li')
      .each((i, li) => {
        const text = $(li).text().replace(/\s+/g, ' ').trim();
        if (!text) return;
        // "Arsenal (98.7)" / "1. Arsenal — 98.7" — the leading number is the
        // rank when present, otherwise the list position is.
        const m = text.match(/^(\d+)[.)]\s*(.+)$/);
        const rank = m ? Number(m[1]) : i + 1;
        const rest = m?.[2] ?? text;
        const scoreMatch = rest.match(/\(?(\d+(?:\.\d+)?)\)?\s*$/);
        const team = scoreMatch ? rest.slice(0, scoreMatch.index).replace(/[—–\-(]+\s*$/, '').trim() : rest;
        if (!team) return;
        rows.push({
          rank,
          team_name: team,
          resolved_entity_id: null,
          score: scoreMatch ? toNumber(scoreMatch[1]) : null,
          movement: null,
          competition: null,
        });
      });
    if (rows.length >= 10) entries.push(...rows);
  });
  return entries;
}

/** Strategy 3: headings/paragraph lines shaped like "3. Bayern Munich". */
function fromTextLines($: cheerio.CheerioAPI): RankingEntry[] {
  const rows: RankingEntry[] = [];
  $('h2, h3, h4, p, li').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const m = text.match(/^(\d{1,3})[.)]\s+([A-Za-zÀ-ÿ][^—–|(]{1,60}?)(?:\s*[—–|(]|$)/);
    const teamRaw = m?.[2];
    if (!m || !teamRaw) return;
    const rank = Number(m[1]);
    if (rank < 1 || rank > 500) return;
    rows.push({
      rank,
      team_name: teamRaw.trim(),
      resolved_entity_id: null,
      score: null,
      movement: null,
      competition: null,
    });
  });
  // Only trust this loose pattern if it found a coherent run of ranks.
  const uniqueRanks = new Set(rows.map((r) => r.rank));
  return uniqueRanks.size >= 10 ? rows : [];
}

// The ranked-list widget's own URL — read from the article's embedded
// iframe (findWidgetUrl) when possible; this is the fallback if that lookup
// ever comes back empty. Verified live 2026-08-24.
const DEFAULT_WIDGET_URL = 'https://dataviz.theanalyst.com/opta-power-rankings/';

function findWidgetUrl($: cheerio.CheerioAPI): string {
  // The article also embeds an unrelated dataviz.theanalyst.com "Match
  // Ticker" iframe earlier in the DOM (opta-football-predictions) — match on
  // the power-rankings path specifically, not just the subdomain.
  const src = $('iframe[src*="dataviz.theanalyst.com/opta-power-rankings"]').first().attr('src');
  if (!src) return DEFAULT_WIDGET_URL;
  try {
    return new URL(src, 'https://theanalyst.com').toString();
  } catch {
    return DEFAULT_WIDGET_URL;
  }
}

export async function fetchPowerRankings(url: string): Promise<PowerRankingsPage> {
  const html = await fetchRenderedHtml(url);
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    'Opta Power Rankings';
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    null;

  // The ranked list itself lives in a separate cross-origin widget page, not
  // the article's own DOM — see the module doc comment.
  const widgetUrl = findWidgetUrl($);
  // The widget polls continuously, so plain 'networkidle' is flaky here —
  // wait for the actual table body instead (verified against the live
  // widget).
  const widgetHtml = await fetchRenderedHtml(widgetUrl, {
    waitForSelector: 'table tbody tr',
    timeoutMs: 20_000,
  });
  const $widget = cheerio.load(widgetHtml);

  const rankings = (() => {
    const t = fromTables($widget);
    if (t.length) return t;
    const o = fromOrderedLists($widget);
    if (o.length) return o;
    return fromTextLines($widget);
  })();

  if (rankings.length === 0) {
    throw new Error(
      `theanalyst power rankings: no ranked list found in widget — layout drift? (${widgetUrl})`
    );
  }

  // Dedupe on rank (keep first occurrence) and sort.
  const byRank = new Map<number, RankingEntry>();
  for (const r of rankings) if (!byRank.has(r.rank)) byRank.set(r.rank, r);
  const deduped = [...byRank.values()].sort((a, b) => a.rank - b.rank);

  $('script, style, nav, header, footer, noscript, aside, form, table, ol').remove();
  const root = $('article').length ? $('article') : $('main').length ? $('main') : $('body');
  const narrativeText = root.text().replace(/\s+/g, ' ').trim();

  return { rankings: deduped, narrativeText, title, publishedAt };
}
