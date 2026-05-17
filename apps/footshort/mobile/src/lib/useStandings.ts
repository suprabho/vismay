import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type StandingRow = {
  competition_slug: string;
  season: string;
  team_id: string;
  position: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form: string | null;
  team: {
    id: string;
    slug: string;
    name: string;
    crest_url: string | null;
  } | null;
};

const STANDING_COLS = `
  competition_slug, season, team_id, position, played, won, draw, lost,
  goals_for, goals_against, goal_difference, points, form,
  team:entities!standings_team_id_fkey(id, slug, name, crest_url)
`;

async function fetchLatestSeason(competitionSlug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('standings')
    .select('season')
    .eq('competition_slug', competitionSlug)
    .order('season', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.season ?? null;
}

export function useStandings(competitionSlug: string | undefined, season?: string) {
  return useQuery({
    queryKey: ['standings', competitionSlug, season ?? 'latest'],
    enabled: !!competitionSlug,
    queryFn: async (): Promise<StandingRow[]> => {
      const s = season ?? (await fetchLatestSeason(competitionSlug!));
      if (!s) return [];
      const { data, error } = await supabase
        .from('standings')
        .select(STANDING_COLS)
        .eq('competition_slug', competitionSlug!)
        .eq('season', s)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StandingRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeamStanding(teamId: string | undefined, competitionSlug: string | undefined) {
  return useQuery({
    queryKey: ['standings', 'team', teamId, competitionSlug],
    enabled: !!teamId && !!competitionSlug,
    queryFn: async (): Promise<StandingRow | null> => {
      const { data, error } = await supabase
        .from('standings')
        .select(STANDING_COLS)
        .eq('competition_slug', competitionSlug!)
        .eq('team_id', teamId!)
        .order('season', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StandingRow) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
