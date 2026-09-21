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
 *   3. Alias lookup — the shared ENTITY_ALIASES map ("Man Utd" → Manchester
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
import { ENTITY_ALIASES as ALIASES, canonicalTeamKey, normalizeEntityKey as normalize } from '@footshorts/shared/entityKeys';

// The slug rule + alias table live in @footshorts/shared/entityKeys so the
// admin's ESPN cup fixtures and the story hydrator resolve labels the same
// way this resolver does. Re-exported for the theanalyst match discovery.
export { canonicalTeamKey };

/** A candidate tag: the canonical row a Gemini-extracted name resolved to,
 *  plus the surface form that produced it. The Jev precision gate
 *  (jevEntityGate.ts) needs the canonical name to phrase its question, and the
 *  surface form is what `[entity-miss]` logs and alias fixes are written
 *  against — keep both rather than making callers re-look-up either. */
export type ResolvedEntity = {
  id: string;
  type: EntityType;
  /** Canonical `entities.name`, e.g. "Tottenham Hotspur". */
  name: string;
  /** The name as extracted from the article, e.g. "Spurs". */
  sourceName: string;
};

type EntityType = 'league' | 'team' | 'player';

type EntityMeta = { name: string; type: EntityType };

// In-memory caches — refreshed on each worker run
let entityCache: Map<string, string> | null = null;
let entityMetaCache: Map<string, EntityMeta> | null = null;
let aliasCache: Map<string, string> | null = null;

async function loadEntityCache(supabase: SupabaseClient): Promise<Map<string, string>> {
  if (entityCache) return entityCache;

  const { data, error } = await supabase
    .from('entities')
    .select('id, name, slug, type');

  if (error) throw error;

  const cache = new Map<string, string>();
  const meta = new Map<string, EntityMeta>();
  for (const e of data ?? []) {
    // Index by normalized name AND slug for fast lookup
    cache.set(`${e.type}:${normalize(e.name)}`, e.id);
    cache.set(`${e.type}:${e.slug}`, e.id);
    // Reverse index, so a resolved id can name itself without a second query.
    meta.set(e.id, { name: e.name, type: e.type });
  }
  entityCache = cache;
  entityMetaCache = meta;
  return cache;
}

// Editor-taught aliases (`entity_aliases` table) — same shape/key as ENTITY_ALIASES
// but writable at runtime from the admin, without a worker redeploy.
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

/**
 * Resolve Gemini's free-text names to canonical rows, keeping each row's name
 * and type. Deduped by entity id — two surface forms of the same club ("Spurs"
 * and "Tottenham") collapse to one tag, the first one wins.
 */
export async function resolveEntitiesDetailed(
  supabase: SupabaseClient,
  entities: GeminiSummary['entities']
): Promise<ResolvedEntity[]> {
  const cache = await loadEntityCache(supabase);
  const aliases = await loadAliasCache(supabase);
  // loadEntityCache fills both maps together; the fallback below keeps a
  // future change to that pairing from costing us a valid tag.
  const meta = entityMetaCache ?? new Map<string, EntityMeta>();
  const resolved: ResolvedEntity[] = [];
  const seen = new Set<string>();

  const byType: [EntityType, string[]][] = [
    ['league', entities.leagues],
    ['team', entities.teams],
    ['player', entities.players],
  ];

  for (const [type, names] of byType) {
    for (const sourceName of names) {
      const id = await resolveOne(cache, aliases, type, sourceName);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      // An id always comes from the cache we just built, so meta is present;
      // fall back to the extracted name rather than dropping a valid tag.
      const row = meta.get(id);
      resolved.push({ id, type, name: row?.name ?? sourceName, sourceName });
    }
  }

  return resolved;
}

export async function resolveEntities(
  supabase: SupabaseClient,
  entities: GeminiSummary['entities']
): Promise<string[]> {
  return (await resolveEntitiesDetailed(supabase, entities)).map((e) => e.id);
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
  entityMetaCache = null;
  aliasCache = null;
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
