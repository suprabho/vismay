'use client';

import { useQuery } from '@tanstack/react-query';
import { latestSeason } from '@vismay/footshorts-viz/web';
import { supabase } from './supabase';

// StandingRow lives in @vismay/footshorts-viz so StandingsTable can be reused.
// Imported for internal use AND re-exported for app call sites.
import type { StandingRow, StandingTeamRef } from '@vismay/footshorts-viz/types';
export type { StandingRow, StandingTeamRef };

const STANDING_COLS = `
  competition_slug, season, team_id, position, played, won, draw, lost,
  goals_for, goals_against, goal_difference, points, form,
  phase, group_label,
  team:entities!standings_team_id_fkey(id, slug, name, crest_url)
`;

// Ordered client-side rather than with `.order('season')`: season labels don't
// sort as plain strings ("2026" lands before "25-26" because it compares '0'
// against '5'), which would pin a cup's standings to a season it has left.
async function fetchLatestSeason(competitionSlug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('standings')
    .select('season')
    .eq('competition_slug', competitionSlug);
  if (error) throw error;
  return latestSeason(((data ?? []) as Array<{ season: string }>).map((r) => r.season));
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
      // One row per season for this team; pick the newest chronologically
      // rather than with a string sort on the season label (see
      // fetchLatestSeason above).
      const { data, error } = await supabase
        .from('standings')
        .select(STANDING_COLS)
        .eq('competition_slug', competitionSlug!)
        .eq('team_id', teamId!);
      if (error) throw error;
      const rows = (data ?? []) as unknown as StandingRow[];
      const newest = latestSeason(rows.map((r) => r.season));
      return rows.find((r) => r.season === newest) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
