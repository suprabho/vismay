/**
 * Entity resolver.
 *
 * Gemini returns entity names like "Arsenal", "Bukayo Saka", "Premier League".
 * We need to map these to canonical entities in our DB (with stable IDs linked
 * to football-data.org / api-football IDs).
 *
 * Strategy (cheap → expensive):
 *   1. Exact name match (case-insensitive)
 *   2. Slug match on normalized form
 *   3. Alias lookup — the hardcoded ALIASES map below ("Man Utd" → Manchester
 *      United, "Real" → Real Madrid), then the `entity_aliases` DB table
 *      (editor-taught via the admin "resolve identities" UI, e.g. Power
 *      rankings — no code change/redeploy needed for those)
 *   4. Fuzzy match (Levenshtein) — only if above fail, and only cached
 *
 * Unknown entities are logged for manual review — we DON'T auto-create them.
 * This keeps the canonical set clean and prevents Gemini hallucinations from
 * polluting the follow graph.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { GeminiSummary } from '@footshorts/shared/schemas';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// In-memory caches — refreshed on each worker run
let entityCache: Map<string, string> | null = null;
let aliasCache: Map<string, string> | null = null;

async function loadEntityCache(supabase: SupabaseClient): Promise<Map<string, string>> {
  if (entityCache) return entityCache;

  const { data, error } = await supabase
    .from('entities')
    .select('id, name, slug, type');

  if (error) throw error;

  const cache = new Map<string, string>();
  for (const e of data ?? []) {
    // Index by normalized name AND slug for fast lookup
    cache.set(`${e.type}:${normalize(e.name)}`, e.id);
    cache.set(`${e.type}:${e.slug}`, e.id);
  }
  entityCache = cache;
  return cache;
}

// Editor-taught aliases (`entity_aliases` table) — same shape/key as ALIASES
// below but writable at runtime from the admin, without a worker redeploy.
// See supabase/footshorts/migrations/20260825000000_entity_aliases.sql.
async function loadAliasCache(supabase: SupabaseClient): Promise<Map<string, string>> {
  if (aliasCache) return aliasCache;

  const { data, error } = await supabase
    .from('entity_aliases')
    .select('entity_type, alias_slug, entity_id');

  if (error) throw error;

  const cache = new Map<string, string>();
  for (const a of data ?? []) {
    cache.set(`${a.entity_type}:${a.alias_slug}`, a.entity_id);
  }
  aliasCache = cache;
  return cache;
}

// Common aliases — extend as you find misses in the failure logs.
// Slugs on the right must match canonical entity slugs produced by seed.ts commonName().
const ALIASES: Record<string, string> = {
  // teams — English
  'man-utd': 'manchester-united',
  'man-united': 'manchester-united',
  'man-city': 'manchester-city',
  'spurs': 'tottenham-hotspur',
  'tottenham': 'tottenham-hotspur',
  'wolves': 'wolverhampton-wanderers',
  'brighton': 'brighton-hove-albion',
  // teams — Spanish
  'barca': 'barcelona',
  'real': 'real-madrid',
  'atleti': 'club-atletico-de-madrid',
  'atletico': 'club-atletico-de-madrid',
  'atletico-madrid': 'club-atletico-de-madrid',
  'betis': 'real-betis-balompie',
  // teams — German
  'bayern': 'bayern-munchen',
  'bayern-munich': 'bayern-munchen',
  // teams — Italian
  'juve': 'juventus',
  'inter': 'internazionale-milano',
  'inter-milan': 'internazionale-milano',
  'verona': 'hellas-verona',
  // official forms with glued acronyms, in case Gemini echoes them verbatim
  'acf-fiorentina': 'fiorentina',
  'atalanta-bc': 'atalanta',
  'genoa-cfc': 'genoa',
  // teams — French
  'psg': 'paris-saint-germain',
  'paris-sg': 'paris-saint-germain',   // theanalyst.com's spelling
  'lyon': 'olympique-lyonnais',
  'marseille': 'olympique-de-marseille',
  // teams — theanalyst.com's Championship short forms (verified live 2026-09-09;
  // these have no token in common with the official name, so per-word
  // teamKeyVariants can't bridge them)
  'qpr': 'queens-park-rangers',
  'sheff-utd': 'sheffield-united',
  'sheff-wed': 'sheffield-wednesday',
  'bristol-c': 'bristol-city',
  'west-brom': 'west-bromwich-albion',
  'nottm-forest': 'nottingham-forest',
  // teams — long official names → common names
  'newcastle': 'newcastle-united',
  'real-betis': 'real-betis-balompie',
  // leagues — renames Gemini uses vs official seed names
  'epl': 'premier-league',
  'ucl': 'champions-league',
  'uel': 'europa-league',
  'la-liga': 'primera-division',
  'laliga': 'primera-division',
  'euros': 'european-championship',
  'euro': 'european-championship',
  'world-cup': 'fifa-world-cup',     // seed stores "FIFA World Cup"; Gemini says "World Cup"
  'brasileirao': 'campeonato-brasileiro-serie-a',
  'serie-a': 'serie-a',
  'ligue-1': 'ligue-1',
  'bundesliga': 'bundesliga',
};

async function resolveOne(
  cache: Map<string, string>,
  aliases: Map<string, string>,
  type: 'league' | 'team' | 'player',
  name: string
): Promise<string | null> {
  const slug = normalize(name);

  // 1. Direct hit
  const direct = cache.get(`${type}:${slug}`);
  if (direct) return direct;

  // 2a. Hardcoded alias hit
  const aliased = ALIASES[slug];
  if (aliased) {
    const hit = cache.get(`${type}:${aliased}`);
    if (hit) return hit;
  }

  // 2b. Editor-taught alias hit (entity_aliases table)
  const dbAliasHit = aliases.get(`${type}:${slug}`);
  if (dbAliasHit) return dbAliasHit;

  // 3. Unknown — log for later backfill
  console.log(`[entity-miss] ${type}=${name} (slug=${slug})`);
  return null;
}

export async function resolveEntities(
  supabase: SupabaseClient,
  entities: GeminiSummary['entities']
): Promise<string[]> {
  const cache = await loadEntityCache(supabase);
  const aliases = await loadAliasCache(supabase);
  const resolvedIds: string[] = [];

  for (const name of entities.leagues) {
    const id = await resolveOne(cache, aliases, 'league', name);
    if (id) resolvedIds.push(id);
  }
  for (const name of entities.teams) {
    const id = await resolveOne(cache, aliases, 'team', name);
    if (id) resolvedIds.push(id);
  }
  for (const name of entities.players) {
    const id = await resolveOne(cache, aliases, 'player', name);
    if (id) resolvedIds.push(id);
  }

  return [...new Set(resolvedIds)];
}

// Single-entity resolver, exposed so the squad ingest can map each player's
// `club_name_raw` to an existing `entities(type='team')` row without going
// through the article tagger's bulk shape.
export async function resolveTeamName(
  supabase: SupabaseClient,
  name: string
): Promise<string | null> {
  const cache = await loadEntityCache(supabase);
  const aliases = await loadAliasCache(supabase);
  return resolveOne(cache, aliases, 'team', name);
}

export function clearEntityCache() {
  entityCache = null;
  aliasCache = null;
}

// Normalization + alias mapping exposed for callers that compare team labels
// from two providers directly (e.g. theanalyst match discovery matching
// scraped team names against fixtures) — same rules as resolveOne, minus the
// entity-cache lookup, so both sides of a comparison collapse to one key.
// Our own entity names carry the official "FC"/"AFC" club suffix
// (football-data.org convention, e.g. "Sunderland AFC", "AFC Bournemouth"),
// which the alias table above doesn't strip — so it's stripped here first.
export function canonicalTeamKey(name: string): string {
  const slug = normalize(name).replace(/^a?fc-/, '').replace(/-a?fc$/, '');
  return ALIASES[slug] ?? slug;
}

/**
 * Tokens that never identify a club on their own — club-type words, articles,
 * founding years, generic prefixes ("Real", "Stade", "Racing") shared by many
 * clubs. Dropped from teamKeyVariants' per-word variants so "RC Strasbourg
 * Alsace" contributes {strasbourg, alsace}, not {rc}. The full canonical key
 * always stays in the set, so "Real Madrid" ↔ "Real Madrid CF" still matches
 * exactly even though "real" alone is dropped.
 */
const TEAM_NOISE_TOKENS = new Set([
  'fc', 'cf', 'afc', 'ac', 'as', 'ss', 'ssc', 'us', 'sc', 'rc', 'rcd', 'ca', 'cd', 'ud', 'sd', 'sv', 'fsv',
  'tsg', 'vfb', 'vfl', 'bsc', 'fk', 'sk', 'bk', 'if', 'sco', 'sg',
  'club', 'clube', 'calcio', 'futbol', 'football', 'sport', 'sports', 'sportverein', 'sporting',
  'racing', 'stade', 'olympique', 'real', 'athletic-club',
  'de', 'la', 'le', 'les', 'del', 'di', 'da', 'do', 'du', 'dos', 'e', 'y', 'und', 'of',
]);

/**
 * Word-level synonyms between providers' spellings of the same club stem —
 * theanalyst.com's media-style short names vs the official names our
 * entities carry. Applied per token (both directions) so "Stade Brestois 29"
 * ↔ "Brest" and "Borussia Mönchengladbach" ↔ "M'gladbach" meet in the middle.
 * Verified against the live fixtures pages 2026-09-09 (Ligue 1, Bundesliga).
 */
const TEAM_TOKEN_SYNONYMS: Record<string, string> = {
  brestois: 'brest',
  rennais: 'rennes',
  hamburger: 'hamburg',
  monchengladbach: 'gladbach',
  mgladbach: 'gladbach',
  leverkusen: 'bayer',
  internazionale: 'inter',
};

/**
 * Variant keys for fuzzy team-name matching across providers with very
 * different naming conventions for the same club — theanalyst.com favours
 * media-style single-word nicknames ("Palace", "Forest", "Villa", "Hull",
 * "Leeds", "Brest", "Sassuolo") where our own entity names are full official
 * names ("Crystal Palace FC", "Nottingham Forest FC", "Stade Brestois 29",
 * "US Sassuolo Calcio"). Alongside the canonical key, includes every
 * meaningful word of the name (TEAM_NOISE_TOKENS dropped: club-type
 * abbreviations, articles, founding years, generic "Real"/"Stade" prefixes)
 * plus TEAM_TOKEN_SYNONYMS stems. Earlier this was first+last word only,
 * which missed every "<abbr> <Name> <suffix>" official name ("RC Celta de
 * Vigo", "1. FSV Mainz 05", "RCD Espanyol de Barcelona") — a whole
 * matchday's worth of La Liga/Bundesliga/Ligue 1 fixtures a run (verified
 * 2026-09-09). False positives are bounded by the caller's ambiguity check:
 * a spurious single-word collision just means the pairing is skipped, not
 * mis-mapped, unless it's the ONLY candidate for BOTH sides in the date
 * window.
 */
export function teamKeyVariants(name: string): Set<string> {
  const key = canonicalTeamKey(name);
  const variants = new Set([key]);
  const tokens = key.split('-').filter(Boolean);
  if (tokens.length > 1) {
    for (const t of tokens) {
      if (t.length < 3 || /^\d+$/.test(t) || TEAM_NOISE_TOKENS.has(t)) continue;
      variants.add(t);
      const syn = TEAM_TOKEN_SYNONYMS[t];
      if (syn) variants.add(syn);
    }
  } else if (tokens[0]) {
    const syn = TEAM_TOKEN_SYNONYMS[tokens[0]];
    if (syn) variants.add(syn);
  }
  return variants;
}
