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
let aliasWarned = false;

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

  const cache = new Map<string, string>();
  if (error) {
    // The alias table is an optional enrichment on top of the hardcoded
    // ALIASES map. If it is unreadable (most likely: the migration hasn't
    // been `db push`ed yet — 2026-08-24 this took the whole news feed down,
    // every article landing as status='failed'), degrade to ALIASES rather
    // than failing every article in the run. Warn once per process.
    if (!aliasWarned) {
      aliasWarned = true;
      console.warn(`[entityResolver] entity_aliases unavailable, using hardcoded ALIASES only: ${error.message}`);
    }
    return cache; // not cached — retried on the next call in case it was transient
  }

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
  'lyon': 'olympique-lyonnais',
  'marseille': 'olympique-de-marseille',
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
 * Variant keys for fuzzy team-name matching across providers with very
 * different naming conventions for the same club — theanalyst.com favours
 * media-style single-word nicknames ("Palace", "Forest", "Villa", "Hull",
 * "Leeds") where our own entity names are full official names ("Crystal
 * Palace FC", "Nottingham Forest FC", ...). Alongside the canonical key,
 * includes the first and last word of a multi-word name — covers both
 * prefix nicknames (Hull, Ipswich, Coventry) and suffix nicknames (Forest,
 * Villa, Palace). A handful of mid-word nicknames (e.g. "Betis" for "Real
 * Betis Balompié") aren't covered by this and need an explicit ALIASES
 * entry instead. False positives are bounded by the caller's ambiguity
 * check: a spurious single-word collision just means the pairing is
 * skipped, not mis-mapped, unless it's the ONLY candidate for BOTH sides
 * in the date window.
 */
export function teamKeyVariants(name: string): Set<string> {
  const key = canonicalTeamKey(name);
  const variants = new Set([key]);
  const tokens = key.split('-');
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && first && last) {
    variants.add(first);
    variants.add(last);
  }
  return variants;
}
