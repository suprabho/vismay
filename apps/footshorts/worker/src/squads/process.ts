/**
 * Squad processor. Takes RawSquadEntry[] from any source adapter and lands
 * them into entities + player_profiles + wc26_squads, resolving each player's
 * club to an existing team entity where possible. Unresolved clubs are queued
 * in wc26_squad_unmatched_clubs for admin review (never auto-created — same
 * principle as the article entity tagger).
 *
 * Idempotent: re-running for the same country updates jersey/position/club
 * on known players and inserts new ones. Does NOT remove players who dropped
 * out — that needs a separate --prune step (not implemented in Phase 1).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { resolveTeamName, clearEntityCache } from '../entityResolver';
import { slugify } from './slug';
import { ProcessResult, RawSquadEntry, SquadSource } from './types';

type ProcessArgs = {
  supabase: SupabaseClient;
  countryCode: string;
  countryName: string;
  entries: RawSquadEntry[];
  source: SquadSource;
  announcedAt: Date;
};

export async function processSquad(args: ProcessArgs): Promise<ProcessResult> {
  const { supabase, countryCode, countryName, entries, source, announcedAt } = args;

  if (entries.length === 0) {
    return {
      country_code: countryCode,
      source,
      players_seen: 0,
      players_inserted: 0,
      players_updated: 0,
      clubs_matched: 0,
      clubs_unmatched: 0,
      unmatched_club_names: [],
    };
  }

  // Refresh resolver cache so any entities added since last run are visible.
  clearEntityCache();

  // 1) Upsert player entities. Slug from name only — collisions across
  // countries with same-named players are rare enough at international
  // level to defer; if it bites, we'll suffix with country code.
  const playerRows = entries.map((e) => ({
    type: 'player' as const,
    slug: slugify(e.name),
    name: e.name,
    country: countryName,
    crest_url: e.photo_url ?? null,
  }));

  const dedupedPlayers = Array.from(
    new Map(playerRows.map((p) => [p.slug, p])).values()
  );

  const { error: entitiesError } = await supabase
    .from('entities')
    .upsert(dedupedPlayers, { onConflict: 'type,slug' });

  if (entitiesError) throw entitiesError;

  // 2) Look up player ids back by slug to wire up the squad table.
  const { data: lookup, error: lookupError } = await supabase
    .from('entities')
    .select('id, slug')
    .eq('type', 'player')
    .in('slug', dedupedPlayers.map((p) => p.slug));

  if (lookupError) throw lookupError;

  const playerIdBySlug = new Map<string, string>();
  for (const row of lookup ?? []) {
    playerIdBySlug.set(row.slug, row.id);
  }

  // 3) Upsert player_profiles where we have profile data.
  const profileRows = entries
    .filter((e) => e.date_of_birth || e.position)
    .map((e) => ({
      entity_id: playerIdBySlug.get(slugify(e.name))!,
      date_of_birth: e.date_of_birth ?? null,
      primary_position: e.position ?? null,
      updated_at: new Date().toISOString(),
    }))
    .filter((p) => p.entity_id);

  if (profileRows.length > 0) {
    const { error: profileError } = await supabase
      .from('player_profiles')
      .upsert(profileRows, { onConflict: 'entity_id' });
    if (profileError) throw profileError;
  }

  // 4) Resolve clubs and build squad rows.
  let clubsMatched = 0;
  const unmatched = new Map<string, number>();
  const squadRows: any[] = [];

  for (const e of entries) {
    const playerId = playerIdBySlug.get(slugify(e.name));
    if (!playerId) continue;

    let clubEntityId: string | null = null;
    if (e.club_name_raw) {
      clubEntityId = await resolveTeamName(supabase, e.club_name_raw);
      if (clubEntityId) {
        clubsMatched++;
      } else {
        unmatched.set(
          e.club_name_raw,
          (unmatched.get(e.club_name_raw) ?? 0) + 1
        );
      }
    }

    squadRows.push({
      country_code: countryCode,
      player_entity_id: playerId,
      jersey: e.jersey ?? null,
      position: e.position ?? null,
      role: e.role ?? null,
      club_entity_id: clubEntityId,
      club_name_raw: e.club_name_raw ?? null,
      photo_url: e.photo_url ?? null,
      source,
      announced_at: announcedAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // 5) Detect which players were new vs updated for stats. Look at the
  // existing squad rows for this country first.
  const { data: existing, error: existingError } = await supabase
    .from('wc26_squads')
    .select('player_entity_id')
    .eq('country_code', countryCode);
  if (existingError) throw existingError;

  const existingPlayerIds = new Set((existing ?? []).map((r) => r.player_entity_id));

  // 6) Upsert squad rows.
  const { error: squadError } = await supabase
    .from('wc26_squads')
    .upsert(squadRows, { onConflict: 'country_code,player_entity_id' });
  if (squadError) throw squadError;

  // 7) Push unmatched clubs into the review queue (increment occurrences).
  for (const [clubName, count] of unmatched) {
    const { data: existingUnmatched } = await supabase
      .from('wc26_squad_unmatched_clubs')
      .select('id, occurrences')
      .eq('country_code', countryCode)
      .eq('club_name_raw', clubName)
      .maybeSingle();

    if (existingUnmatched) {
      await supabase
        .from('wc26_squad_unmatched_clubs')
        .update({
          occurrences: existingUnmatched.occurrences + count,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existingUnmatched.id);
    } else {
      await supabase.from('wc26_squad_unmatched_clubs').insert({
        country_code: countryCode,
        club_name_raw: clubName,
        occurrences: count,
      });
    }
  }

  const inserted = squadRows.filter(
    (r) => !existingPlayerIds.has(r.player_entity_id)
  ).length;

  return {
    country_code: countryCode,
    source,
    players_seen: entries.length,
    players_inserted: inserted,
    players_updated: squadRows.length - inserted,
    clubs_matched: clubsMatched,
    clubs_unmatched: Array.from(unmatched.values()).reduce((a, b) => a + b, 0),
    unmatched_club_names: Array.from(unmatched.keys()),
  };
}
