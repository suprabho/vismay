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
};

export function useLeagues() {
  return useQuery({
    queryKey: ['entities', 'leagues'],
    queryFn: async (): Promise<Entity[]> => {
      const { data, error } = await supabase
        .from('entities')
        .select('id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color')
        .eq('type', 'league')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Each team's `league_slug` is overridden to the matched competition slug
// (highest-priority by caller order) so the onboarding UI groups each team
// under a slug the user actually picked — not the stale primary league
// stored on entities (which loses CL participants whose domestic league is
// also seeded; see seed.ts dedupe).
export function useTeams(leagueSlugs: string[] | null) {
  return useQuery({
    queryKey: ['entities', 'teams', leagueSlugs?.slice().sort()],
    enabled: !!leagueSlugs && leagueSlugs.length > 0,
    queryFn: async (): Promise<Entity[]> => {
      const slugs = leagueSlugs ?? [];
      if (slugs.length === 0) return [];

      const { data, error } = await supabase
        .from('competition_teams')
        .select('id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color, competition_slug')
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
      return Array.from(byTeam.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 10 * 60 * 1000,
  });
}
