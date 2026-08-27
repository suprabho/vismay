'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type Entity = {
  id: string;
  type: 'league' | 'team' | 'player';
  slug: string;
  name: string;
  country: string | null;
  league_slug: string | null;
  team_slug: string | null;
  crest_url: string | null;
  primary_color: string | null;
  /** Dedicated feed avatar-disc background (Asset Studio); falls back to primary_color. */
  avatar_bg_color?: string | null;
  popularity: number;
};

export function useLeagues() {
  return useQuery({
    queryKey: ['entities', 'leagues'],
    queryFn: async (): Promise<Entity[]> => {
      const { data, error } = await supabase
        .from('entities')
        .select('id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color, popularity')
        .eq('type', 'league')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Per-league cap applied during onboarding: only the top `TOP_TEAMS_PER_LEAGUE`
// teams (by curated `popularity`) of each picked competition are surfaced.
const TOP_TEAMS_PER_LEAGUE = 5;

// Returns teams participating in any of the given competitions, joined via
// the `competition_teams` view. The Entity's `league_slug` is overridden to
// the matched competition slug (highest-priority by caller order), so the
// onboarding UI groups each team under a slug the user actually picked —
// not the stale "primary league" stored on entities. Each competition is then
// trimmed to its top 5 teams by curated popularity (ties broken by name).
export function useTeams(leagueSlugs: string[] | null) {
  return useQuery({
    queryKey: ['entities', 'teams', leagueSlugs?.slice().sort()],
    enabled: !!leagueSlugs && leagueSlugs.length > 0,
    queryFn: async (): Promise<Entity[]> => {
      const slugs = leagueSlugs ?? [];
      if (slugs.length === 0) return [];

      const { data, error } = await supabase
        .from('competition_teams')
        .select(
          'id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color, popularity, competition_slug'
        )
        .in('competition_slug', slugs)
        .order('name');
      if (error) throw error;

      const priority = new Map(slugs.map((s, i) => [s, i]));
      const byTeam = new Map<string, Entity>();
      for (const row of (data ?? []) as Array<Entity & { competition_slug: string }>) {
        const matched = row.competition_slug;
        const existing = byTeam.get(row.id);
        const newPri = priority.get(matched) ?? Infinity;
        const existingPri = existing
          ? priority.get(existing.league_slug ?? '') ?? Infinity
          : Infinity;
        if (!existing || newPri < existingPri) {
          const { competition_slug: _drop, ...entity } = row;
          byTeam.set(row.id, { ...entity, league_slug: matched });
        }
      }
      // Trim each competition to its top N teams by popularity (desc), then
      // name. Grouping is by the overridden league_slug so a team picked under
      // one competition isn't double-counted against another's quota.
      const byLeague = new Map<string, Entity[]>();
      for (const entity of byTeam.values()) {
        const key = entity.league_slug ?? '';
        const list = byLeague.get(key) ?? [];
        list.push(entity);
        byLeague.set(key, list);
      }
      const top: Entity[] = [];
      for (const list of byLeague.values()) {
        list.sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
        top.push(...list.slice(0, TOP_TEAMS_PER_LEAGUE));
      }
      return top.sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 10 * 60 * 1000,
  });
}
