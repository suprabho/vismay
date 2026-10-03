/**
 * Find national teams named in a piece of text — the matcher behind
 * `backfill:entity-tags -- --national-teams`, which tags articles ingested
 * before national teams existed as entities (every one of those logged an
 * `[entity-miss]` and shipped untagged).
 *
 * This is a backfill heuristic, not the ingest path: live ingest still goes
 * through Gemini + the resolver, which understand context. So it is tuned for
 * precision and the backfill only feeds it headlines — a country in the
 * headline is nearly always what the story is about, whereas summaries are
 * full of passing "England midfielder …" mentions.
 *
 * Matching runs on normalizeEntityKey tokens, so accents and punctuation don't
 * matter ("Côte d'Ivoire", "ARGENTINA's") and every alias in nationalTeams.ts
 * counts. Longer names win and consume their tokens, so "Papua New Guinea"
 * never also tags Guinea, "DR Congo" never tags Congo, "Northern Ireland"
 * never tags the Republic via its "ireland" alias.
 */

import { normalizeEntityKey } from '@footshorts/shared/entityKeys';
import { NATIONAL_TEAMS } from '@footshorts/shared/nationalTeams';

/** Team names that are just as often something else in football copy —
 *  a player's first name (Jordan Pickford, Jordan Henderson; Chad), or a club
 *  (FC Andorra in Segunda). Left to Gemini at ingest; skipped here. */
const AMBIGUOUS_SLUGS = new Set(['jordan', 'chad', 'andorra']);

/** Phrases that contain a team name but aren't that team — consumed so the
 *  name inside them can't match, never tagged themselves. */
const NON_TEAM_PHRASES = ['new-england', 'new-mexico', 'new-south-wales', 'universidad-de-chile'];

type Term = { tokens: string[]; slug: string | null };

const TERMS: Term[] = [
  ...NATIONAL_TEAMS.filter((t) => !AMBIGUOUS_SLUGS.has(t.slug)).flatMap((t) =>
    [t.slug, ...(t.aliases ?? [])].map((key) => ({ tokens: key.split('-'), slug: t.slug })),
  ),
  ...NON_TEAM_PHRASES.map((p) => ({ tokens: p.split('-'), slug: null })),
].sort((a, b) => b.tokens.length - a.tokens.length);

/** "England Women", "Spain U21", "Brazil U-20", "England's U21s", "Argentina
 *  Under-23", "Spain Olympic" — a different side from the senior men's team
 *  the entity stands for. */
function isOtherSide(tokens: string[], after: number): boolean {
  let i = after;
  if (tokens[i] === 's') i++; // possessive: "England's U21s"
  const next = tokens[i];
  if (!next) return false;
  if (next === 'women' || next === 'womens' || next === 'under' || next === 'olympic') return true;
  if (/^u\d{2}s?$/.test(next)) return true; // u21, u21s
  return next === 'u' && /^\d{2}s?$/.test(tokens[i + 1] ?? ''); // "U-21" → u, 21
}

/** Slugs of the national teams `text` names, in first-seen order, deduped. */
export function findNationalTeams(text: string): string[] {
  const tokens = normalizeEntityKey(text).split('-').filter(Boolean);
  const used = new Array<boolean>(tokens.length).fill(false);
  const found: { slug: string; at: number }[] = [];

  for (const term of TERMS) {
    const n = term.tokens.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      let hit = true;
      for (let k = 0; k < n; k++) {
        if (used[i + k] || tokens[i + k] !== term.tokens[k]) {
          hit = false;
          break;
        }
      }
      if (!hit) continue;
      for (let k = 0; k < n; k++) used[i + k] = true;
      if (term.slug && !isOtherSide(tokens, i + n)) found.push({ slug: term.slug, at: i });
      i += n - 1;
    }
  }

  const out: string[] = [];
  for (const { slug } of found.sort((a, b) => a.at - b.at)) {
    if (!out.includes(slug)) out.push(slug);
  }
  return out;
}
