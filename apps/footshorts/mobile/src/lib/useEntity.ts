import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Entity } from './useEntities';

const ENTITY_COLS = 'id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color';

export function useEntity(type: 'league' | 'team' | 'player', slug: string | undefined) {
  return useQuery({
    queryKey: ['entity', type, slug],
    enabled: !!slug,
    queryFn: async (): Promise<Entity | null> => {
      const { data, error } = await supabase
        .from('entities')
        .select(ENTITY_COLS)
        .eq('type', type)
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return (data as Entity) ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useTeamsInLeague(leagueSlug: string | undefined) {
  return useQuery({
    queryKey: ['entities', 'teams', 'in-league', leagueSlug],
    enabled: !!leagueSlug,
    queryFn: async (): Promise<Entity[]> => {
      const { data, error } = await supabase
        .from('entities')
        .select(ENTITY_COLS)
        .eq('type', 'team')
        .eq('league_slug', leagueSlug!)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function usePlayersInTeam(teamSlug: string | undefined) {
  return useQuery({
    queryKey: ['entities', 'players', 'in-team', teamSlug],
    enabled: !!teamSlug,
    queryFn: async (): Promise<Entity[]> => {
      const { data, error } = await supabase
        .from('entities')
        .select(ENTITY_COLS)
        .eq('type', 'player')
        .eq('team_slug', teamSlug!)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
