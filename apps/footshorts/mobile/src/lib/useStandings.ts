import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { isHiddenCompetition } from './hiddenContent';

// StandingRow lives in @vismay/footshorts-viz. Re-export keeps app call sites
// working; internal uses below need the import too.
import type { StandingRow, StandingTeamRef } from '@vismay/footshorts-viz/types';
export type { StandingRow, StandingTeamRef };

const STANDING_COLS = `
  competition_slug, season, team_id, position, played, won, draw, lost,
  goals_for, goals_against, goal_difference, points, form,
  phase, group_label,
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
    enabled: !!competitionSlug && !isHiddenCompetition(competitionSlug),
    queryFn: async (): Promise<StandingRow[]> => {
      const s = season ?? (await fetchLatestSeason(competitionSlug!));
      if (!s) return [];
      const { data, error } = await supabase
        .from('standings')
        .select(STANDING_COLS)
        .eq('competition_slug', competitionSlug!)
        .eq('season', s)
        // group_label first so group-stage cups return Group A then Group B etc.
        // intact. For league standings group_label is '' so this is a no-op.
        .order('group_label', { ascending: true })
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StandingRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Bucket a flat standing list into one table per group. For league standings
 * (group_label === '') this returns a single bucket. Caller renders each
 * bucket as its own StandingsTable.
 */
export function groupStandings(
  rows: StandingRow[],
): { label: string; rows: StandingRow[] }[] {
  const buckets = new Map<string, StandingRow[]>();
  for (const r of rows) {
    const key = r.group_label ?? '';
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  return Array.from(buckets.entries()).map(([label, rows]) => ({ label, rows }));
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
