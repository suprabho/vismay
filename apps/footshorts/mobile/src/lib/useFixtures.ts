import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { seasonStartIso } from '@vismay/footshorts-viz/native';
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

// The fixtures sync upserts on football_data_id and never deletes, so the table
// holds every season it has ever pulled. Reads have to name a season or a new
// campaign shows up as last season's results and a schedule of stacked
// Matchday 1s. Mirrors apps/footshorts/web/lib/useFixtures.ts.
const CURRENT_SEASON_STALE_MS = 30 * 60 * 1000;

/**
 * The season a competition is currently in — the season of its furthest-out
 * fixture. Read off the data rather than the calendar so it holds for both
 * multi-year league labels ("26-27") and single-year cup labels ("2026").
 */
export async function fetchCurrentSeason(competitionSlug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('fixtures')
    .select('season')
    .eq('competition_slug', competitionSlug)
    .order('kickoff_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.season as string | undefined) ?? null;
}

const currentSeasonKey = (competitionSlug: string) =>
  ['fixtures', 'current-season', competitionSlug] as const;

/** Resolve (and cache) a competition's current season through the query client. */
export function resolveCurrentSeason(
  qc: QueryClient,
  competitionSlug: string,
): Promise<string | null> {
  return qc.fetchQuery({
    queryKey: currentSeasonKey(competitionSlug),
    queryFn: () => fetchCurrentSeason(competitionSlug),
    staleTime: CURRENT_SEASON_STALE_MS,
  });
}

/** The current season of a competition, for labelling a screen or empty state. */
export function useCurrentSeason(competitionSlug: string | undefined) {
  return useQuery({
    queryKey: currentSeasonKey(competitionSlug ?? ''),
    enabled: !!competitionSlug && !isHiddenCompetition(competitionSlug),
    queryFn: () => fetchCurrentSeason(competitionSlug!),
    staleTime: CURRENT_SEASON_STALE_MS,
  });
}

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
  /** Pin a specific season; defaults to the competition's current one. */
  season?: string,
) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['fixtures', 'league', competitionSlug, kind, limit, season ?? 'current'],
    enabled: !!competitionSlug && !isHiddenCompetition(competitionSlug),
    queryFn: async (): Promise<FixtureRow[]> => {
      const s = season ?? (await resolveCurrentSeason(qc, competitionSlug!));
      if (!s) return [];
      let q = supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .eq('competition_slug', competitionSlug!)
        .eq('season', s);
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
      // A team's matches span competitions whose season labels differ ("26-27"
      // in the league, "2026" in a cup), so this scopes by the season boundary
      // date instead of a season string — same intent as the league queries.
      let q = supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .gte('kickoff_at', seasonStartIso());
      q = applyKind(q, kind, limit);
      const { data, error } = await q;
      if (error) throw error;
      return filterHiddenFixtures((data ?? []) as unknown as FixtureRow[]);
    },
    staleTime: 60 * 1000,
    refetchInterval: FIXTURES_REFETCH_MS,
  });
}
