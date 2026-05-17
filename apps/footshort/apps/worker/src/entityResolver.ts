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
 *   3. Alias table lookup (for "Man Utd" → Manchester United, "Real" → Real Madrid)
 *   4. Fuzzy match (Levenshtein) — only if above fail, and only cached
 *
 * Unknown entities are logged for manual review — we DON'T auto-create them.
 * This keeps the canonical set clean and prevents Gemini hallucinations from
 * polluting the follow graph.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { GeminiSummary } from '@shortfoot/shared/schemas';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// In-memory cache of canonical entities — refreshed on each worker run
let entityCache: Map<string, string> | null = null;

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
  // teams — German
  'bayern': 'bayern-munchen',
  'bayern-munich': 'bayern-munchen',
  // teams — Italian
  'juve': 'juventus',
  'inter': 'internazionale-milano',
  'inter-milan': 'internazionale-milano',
  'verona': 'hellas-verona',
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
  type: 'league' | 'team' | 'player',
  name: string
): Promise<string | null> {
  const slug = normalize(name);

  // 1. Direct hit
  const direct = cache.get(`${type}:${slug}`);
  if (direct) return direct;

  // 2. Alias hit
  const aliased = ALIASES[slug];
  if (aliased) {
    const hit = cache.get(`${type}:${aliased}`);
    if (hit) return hit;
  }

  // 3. Unknown — log for later backfill
  console.log(`[entity-miss] ${type}=${name} (slug=${slug})`);
  return null;
}

export async function resolveEntities(
  supabase: SupabaseClient,
  entities: GeminiSummary['entities']
): Promise<string[]> {
  const cache = await loadEntityCache(supabase);
  const resolvedIds: string[] = [];

  for (const name of entities.leagues) {
    const id = await resolveOne(cache, 'league', name);
    if (id) resolvedIds.push(id);
  }
  for (const name of entities.teams) {
    const id = await resolveOne(cache, 'team', name);
    if (id) resolvedIds.push(id);
  }
  for (const name of entities.players) {
    const id = await resolveOne(cache, 'player', name);
    if (id) resolvedIds.push(id);
  }

  return [...new Set(resolvedIds)];
}

export function clearEntityCache() {
  entityCache = null;
}
