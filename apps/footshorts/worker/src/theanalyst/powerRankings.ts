/**
 * theanalyst.com Opta Power Rankings article parser.
 *
 * The ranked team list is structured content on the page, so it's extracted
 * deterministically with cheerio (no LLM — same reasoning as the squads
 * wikipedia adapter's table parsing: structured data plus an LLM is just
 * added cost and hallucination surface). The surrounding prose narrative is
 * NOT parsed here beyond plain-text extraction; the entry script
 * (theanalystPowerRankings.ts) summarizes it with Gemini so we store a short
 * abstractive summary, never the full article text.
 *
 * SELECTOR CAVEAT: written without network access to theanalyst.com. Three
 * extraction strategies are tried in order (table rows → ordered-list items →
 * "N. Team" text lines) so moderate DOM drift degrades gracefully, but all of
 * them must be verified against the live article before production
 * (docs/theanalyst-scraping.md checklist).
 */

import * as cheerio from 'cheerio';
import { fetchHtml } from './fetch';

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
  const n = Number(raw.replace(/[^\d.+-]/g, ''));
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

/** Strategy 1: a rankings table — one row per team, rank in the first cell. */
function fromTables($: cheerio.CheerioAPI): RankingEntry[] {
  const entries: RankingEntry[] = [];
  $('table').each((_, table) => {
    if (entries.length) return; // first plausible table wins
    const rows: RankingEntry[] = [];
    $(table)
      .find('tr')
      .each((_, tr) => {
        const cells = $(tr)
          .find('td, th')
          .map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
          .get();
        if (cells.length < 2) return;
        const rank = toNumber(cells[0]);
        if (rank === null || !Number.isInteger(rank) || rank < 1 || rank > 500) return;
        const team = cells[1];
        if (!team || toNumber(team) !== null) return; // second cell must be a name
        rows.push({
          rank,
          team_name: team,
          resolved_entity_id: null,
          score: cells.length > 2 ? toNumber(cells[cells.length - 1]) : null,
          movement: cells.length > 3 ? parseMovement(cells[2] ?? '') : null,
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

export async function fetchPowerRankings(url: string): Promise<PowerRankingsPage> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    'Opta Power Rankings';
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    null;

  const rankings = (() => {
    const t = fromTables($);
    if (t.length) return t;
    const o = fromOrderedLists($);
    if (o.length) return o;
    return fromTextLines($);
  })();

  if (rankings.length === 0) {
    throw new Error(
      `theanalyst power rankings: no ranked list found — JS-rendered page or selector drift? (${url})`
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
