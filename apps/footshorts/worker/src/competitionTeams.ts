/**
 * Keep `entities` holding every club in every competition we cover.
 *
 * seed.ts ran once, so the team set froze at that season's line-ups: clubs
 * promoted since (Racing Santander into the 26-27 Primera División) or new to
 * the Champions League had no row, so articles about them couldn't be tagged
 * and their fixtures fell back to a bare `home_team_name`. The daily fixtures
 * sync calls this per competition, before writing fixtures, so a new club gets
 * a row — and its fixtures and standings link to it — the same day it shows
 * up in football-data.org's season list.
 *
 * Per team in `/competitions/{id}/teams` (current season):
 *   - known football_data_id → nothing to insert;
 *   - a row already at the same slug with no football_data_id (hand-made, or a
 *     national team from 20261001000000_national_team_entities.sql) → claim it
 *     by setting football_data_id, never a duplicate;
 *   - a row at the same slug owned by a different football_data_id → warn and
 *     skip (two clubs collapsing to one slug needs a human);
 *   - otherwise insert, same shape seed.ts writes.
 * Then membership in team_competitions (onboarding's competition → teams
 * view), and football-data's `shortName` as an entity_aliases row so the
 * article resolver also matches the name press actually uses ("Racing
 * Santander" for "Real Racing Club de Santander"). Existing aliases win —
 * an editor's mapping is never overwritten.
 *
 * Inserts only. Existing rows' names, crests and league_slug are left alone,
 * and memberships from past seasons aren't removed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ENTITY_ALIASES, normalizeEntityKey } from '@footshorts/shared/entityKeys';
import { entitySlug } from './teamSlug';

export type FdTeam = {
  id: number;
  name: string;
  shortName?: string | null;
  crest?: string | null;
  area?: { name?: string | null } | null;
};

/** Competitions whose members aren't clubs, or whose clubs belong to another
 *  domestic league. Mirrors NON_DOMESTIC_LEAGUE_CODES in seed.ts. */
export const NON_DOMESTIC_CODES = new Set(['CL', 'EL', 'WC', 'EC']);

/** National-team tournaments — all 211 sides are seeded by migration already,
 *  so the top-up leaves them alone. */
export const NATIONAL_TEAM_CODES = new Set(['WC', 'EC']);

export type CoveredCompetition = {
  /** entities.id of the league row. */
  id: string;
  slug: string;
  /** False for CL/EL/WC/EC: membership is recorded, league_slug isn't set. */
  domestic: boolean;
};

export type TeamTopUp = { inserted: string[]; claimed: string[]; collisions: string[]; aliases: number };

/**
 * Short names too generic to point at one club. football-data uses a few of
 * these as shortName for several clubs at once; an alias would tag them all
 * to whichever club was synced first.
 */
const GENERIC_SHORT_NAMES = new Set(['real', 'racing', 'sporting', 'athletic', 'united', 'city', 'club']);

/** The alias row to write for a team's shortName, or null when it adds nothing. */
export function shortNameAlias(team: FdTeam): { alias_slug: string; alias_label: string } | null {
  const label = team.shortName?.trim();
  if (!label) return null;
  const aliasSlug = normalizeEntityKey(label);
  if (aliasSlug.length < 3 || GENERIC_SHORT_NAMES.has(aliasSlug)) return null;
  // Already reachable by the resolver's direct lookups (slug or full name).
  if (aliasSlug === entitySlug(team.name) || aliasSlug === normalizeEntityKey(team.name)) return null;
  return { alias_slug: aliasSlug, alias_label: label };
}

async function ensureTeam(
  supabase: SupabaseClient,
  team: FdTeam,
  comp: CoveredCompetition,
  result: TeamTopUp,
): Promise<string | null> {
  const slug = entitySlug(team.name);
  // The alias slug too, so an official spelling claims the common-name row
  // ("Club Atlético de Madrid" style renames) instead of duplicating it.
  const candidates = [slug, ENTITY_ALIASES[slug]].filter((s): s is string => Boolean(s));
  const { data: rows, error } = await supabase
    .from('entities')
    .select('id, slug, football_data_id')
    .eq('type', 'team')
    .in('slug', candidates);
  if (error) throw error;
  const existing = candidates.map((c) => rows?.find((r) => r.slug === c)).find(Boolean);

  if (existing) {
    if (existing.football_data_id == null) {
      const { error: claimError } = await supabase
        .from('entities')
        .update({ football_data_id: team.id })
        .eq('id', existing.id);
      if (claimError) throw claimError;
      result.claimed.push(team.name);
      return existing.id as string;
    }
    result.collisions.push(`${team.name} (fd ${team.id}) vs fd ${existing.football_data_id} at slug ${slug}`);
    return null;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('entities')
    .insert({
      type: 'team',
      slug,
      name: team.name,
      football_data_id: team.id,
      country: team.area?.name ?? null,
      league_slug: comp.domestic ? comp.slug : null,
      crest_url: team.crest ?? null,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;
  result.inserted.push(team.name);
  return inserted.id as string;
}

/**
 * Bring one competition's current teams into `entities`. Mutates `teamIndex`
 * (football_data_id → entities.id) so the caller's fixtures/standings writes
 * link the new rows straight away.
 */
export async function topUpCompetitionTeams(
  supabase: SupabaseClient,
  comp: CoveredCompetition,
  teams: FdTeam[],
  teamIndex: Map<number, string>,
): Promise<TeamTopUp> {
  const result: TeamTopUp = { inserted: [], claimed: [], collisions: [], aliases: 0 };
  const memberships: { team_id: string; competition_id: string }[] = [];
  const aliases: { entity_type: 'team'; alias_slug: string; alias_label: string; entity_id: string }[] = [];

  for (const team of teams) {
    let entityId = teamIndex.get(team.id) ?? null;
    if (!entityId) {
      entityId = await ensureTeam(supabase, team, comp, result);
      if (!entityId) continue;
      teamIndex.set(team.id, entityId);
    }
    memberships.push({ team_id: entityId, competition_id: comp.id });
    const alias = shortNameAlias(team);
    if (alias) aliases.push({ entity_type: 'team', ...alias, entity_id: entityId });
  }

  if (memberships.length > 0) {
    const { error } = await supabase
      .from('team_competitions')
      .upsert(memberships, { onConflict: 'team_id,competition_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  // Two teams in one batch sharing a shortName would hit the unique key in a
  // single statement; keep the first and let the resolver's other paths find
  // the second.
  const uniqueAliases = Array.from(new Map(aliases.map((a) => [a.alias_slug, a])).values());
  if (uniqueAliases.length > 0) {
    const { error } = await supabase
      .from('entity_aliases')
      .upsert(uniqueAliases, { onConflict: 'entity_type,alias_slug', ignoreDuplicates: true });
    if (error) throw error;
    result.aliases = uniqueAliases.length;
  }

  return result;
}
