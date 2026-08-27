import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { filterHiddenFixtures, isHiddenCompetition } from './hiddenContent';

// Football-domain types live in @vismay/footshorts-viz so mobile MatchRow
// and any vertical components share a single source of truth.
import type { FixtureRow, FixtureTeamRef, FixtureStatus } from '@vismay/footshorts-viz/types';
export type { FixtureRow, FixtureTeamRef, FixtureStatus };

const FIXTURE_COLS = `
  id, competition_slug, season, matchday, stage, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url)
`;

export type FixtureKind = 'past' | 'upcoming' | 'all';

// Scores land in Supabase from batch syncs, so a mounted fixtures screen has
// to poll to pick them up. 60s matches staleTime; foreground-only (the
// refetchIntervalInBackground default) so a backgrounded app stays quiet.
const FIXTURES_REFETCH_MS = 60 * 1000;

function applyKind<T extends { lt: Function; gte: Function; order: Function }>(
  q: T,
  kind: FixtureKind,
  limit: number,
): any {
  const now = new Date().toISOString();
  const qAny = q as any;
  if (kind === 'past') {
    return qAny.lt('kickoff_at', now).order('kickoff_at', { ascending: false }).limit(limit);
  }
  if (kind === 'upcoming') {
    return qAny.gte('kickoff_at', now).order('kickoff_at', { ascending: true }).limit(limit);
  }
  return qAny.order('kickoff_at', { ascending: false }).limit(limit);
}

export function useLeagueFixtures(
  competitionSlug: string | undefined,
  kind: FixtureKind = 'past',
  limit = 10,
) {
  return useQuery({
    queryKey: ['fixtures', 'league', competitionSlug, kind, limit],
    enabled: !!competitionSlug && !isHiddenCompetition(competitionSlug),
    queryFn: async (): Promise<FixtureRow[]> => {
      let q = supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .eq('competition_slug', competitionSlug!);
      q = applyKind(q, kind, limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FixtureRow[];
    },
    staleTime: 60 * 1000,
    refetchInterval: FIXTURES_REFETCH_MS,
  });
}

export function useTeamFixtures(
  teamId: string | undefined,
  kind: FixtureKind = 'past',
  limit = 10,
) {
  return useQuery({
    queryKey: ['fixtures', 'team', teamId, kind, limit],
    enabled: !!teamId,
    queryFn: async (): Promise<FixtureRow[]> => {
      let q = supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
      q = applyKind(q, kind, limit);
      const { data, error } = await q;
      if (error) throw error;
      return filterHiddenFixtures((data ?? []) as unknown as FixtureRow[]);
    },
    staleTime: 60 * 1000,
    refetchInterval: FIXTURES_REFETCH_MS,
  });
}
