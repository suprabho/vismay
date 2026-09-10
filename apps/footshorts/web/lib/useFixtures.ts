'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { seasonStartIso } from '@vismay/footshorts-viz/web';
import { supabase } from './supabase';

// Football-domain types now live in @vismay/footshorts-viz so MatchRow and
// any vertical components share a single source of truth. Imported for
// internal use AND re-exported so existing call sites in this app keep working.
import type { FixtureRow, FixtureTeamRef, FixtureStatus } from '@vismay/footshorts-viz/types';
export type { FixtureRow, FixtureTeamRef, FixtureStatus };

const FIXTURE_COLS = `
  id, competition_slug, season, matchday, stage, phase, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url)
`;

export type FixtureKind = 'past' | 'upcoming' | 'all';

// The fixtures sync upserts on football_data_id and never deletes, so the table
// holds every season it has ever pulled. Reads therefore have to name a season:
// without one, "recent results" for a competition between campaigns is last
// season's knockout rounds, and a full schedule is three seasons of Matchday 1s
// stacked on top of each other.
const CURRENT_SEASON_STALE_MS = 30 * 60 * 1000;

/**
 * The season a competition is currently in — the season of its furthest-out
 * fixture.
 *
 * Read off the data rather than the calendar, so it holds for multi-year league
 * labels ("26-27") and single-year cup labels ("2026") alike without assuming a
 * rollover date. football-data.org's /matches endpoint only ever returns the
 * competition's current season, so the newest fixture we hold is by definition
 * part of it; the moment the daily sync pulls a new campaign, every read here
 * follows it over.
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

/**
 * Resolve (and cache) a competition's current season. Shared through the query
 * client so the three fixture queries a competition page fires resolve it once
 * between them rather than three times.
 */
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

/** The current season of a competition, for labelling a page or an empty state. */
export function useCurrentSeason(competitionSlug: string | undefined) {
  return useQuery({
    queryKey: currentSeasonKey(competitionSlug ?? ''),
    enabled: !!competitionSlug,
    queryFn: () => fetchCurrentSeason(competitionSlug!),
    staleTime: CURRENT_SEASON_STALE_MS,
  });
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
    enabled: !!competitionSlug,
    queryFn: async (): Promise<FixtureRow[]> => {
      const s = season ?? (await resolveCurrentSeason(qc, competitionSlug!));
      if (!s) return [];
      const now = new Date().toISOString();
      const base = supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .eq('competition_slug', competitionSlug!)
        .eq('season', s);
      const q =
        kind === 'past'
          ? base.lt('kickoff_at', now).order('kickoff_at', { ascending: false }).limit(limit)
          : kind === 'upcoming'
            ? base.gte('kickoff_at', now).order('kickoff_at', { ascending: true }).limit(limit)
            : base.order('kickoff_at', { ascending: false }).limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FixtureRow[];
    },
    staleTime: 60 * 1000,
  });
}

export function useTeamFixtures(
  teamId: string | undefined,
  kind: FixtureKind = 'past',
  limit = 10
) {
  return useQuery({
    queryKey: ['fixtures', 'team', teamId, kind, limit],
    enabled: !!teamId,
    queryFn: async (): Promise<FixtureRow[]> => {
      const now = new Date().toISOString();
      // A team's matches span competitions whose season labels differ ("26-27"
      // in the league, "2026" in a cup), so this scopes by the season boundary
      // date instead of a season string. Same intent as the league queries:
      // never present a finished campaign as the current one.
      const seasonStart = seasonStartIso();
      const base = supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .gte('kickoff_at', seasonStart);
      const q =
        kind === 'past'
          ? base.lt('kickoff_at', now).order('kickoff_at', { ascending: false }).limit(limit)
          : kind === 'upcoming'
            ? base.gte('kickoff_at', now).order('kickoff_at', { ascending: true }).limit(limit)
            : base.order('kickoff_at', { ascending: false }).limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as FixtureRow[];
    },
    staleTime: 60 * 1000,
  });
}
