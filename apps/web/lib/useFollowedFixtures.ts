'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { Entity } from './useEntities';
import type { FixtureRow } from './useFixtures';

const FIXTURE_COLS = `
  id, competition_slug, season, matchday, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url)
`;

export type LeagueSection = {
  entity: Entity;
  lastMatchday: FixtureRow[];
  nextMatchday: FixtureRow[];
  lastMatchdayNumber: number | null;
  nextMatchdayNumber: number | null;
};

export type TeamSection = {
  entity: Entity;
  past: FixtureRow[];
  upcoming: FixtureRow[];
};

export type FollowedFixtures = {
  leagues: LeagueSection[];
  teams: TeamSection[];
};

type FollowRow = {
  entity_id: string;
  created_at: string;
  entity: Entity;
};

export function useFollowedFixtures() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: ['followedFixtures', userId],
    enabled: !!userId,
    queryFn: async (): Promise<FollowedFixtures> => {
      const { data: follows, error: fErr } = await supabase
        .from('follows')
        .select(
          'entity_id, created_at, entity:entities(id, type, slug, name, country, league_slug, team_slug, crest_url, primary_color)'
        )
        .order('created_at', { ascending: false });
      if (fErr) throw fErr;

      const rows = ((follows as unknown as FollowRow[]) ?? []).filter((r) => !!r.entity);
      const leagueEntities = rows.filter((r) => r.entity.type === 'league').map((r) => r.entity);
      const teamEntities = rows.filter((r) => r.entity.type === 'team').map((r) => r.entity);

      const now = new Date().toISOString();

      const leaguePromises = leagueEntities.map(async (league): Promise<LeagueSection> => {
        const [pastRes, upRes] = await Promise.all([
          supabase
            .from('fixtures')
            .select(FIXTURE_COLS)
            .eq('competition_slug', league.slug)
            .eq('status', 'finished')
            .order('kickoff_at', { ascending: false })
            .limit(30),
          supabase
            .from('fixtures')
            .select(FIXTURE_COLS)
            .eq('competition_slug', league.slug)
            .gte('kickoff_at', now)
            .in('status', ['scheduled', 'live'])
            .order('kickoff_at', { ascending: true })
            .limit(30),
        ]);
        const past = (pastRes.data ?? []) as unknown as FixtureRow[];
        const upcoming = (upRes.data ?? []) as unknown as FixtureRow[];

        const lastMd = past.find((f) => f.matchday != null)?.matchday ?? null;
        const nextMd = upcoming.find((f) => f.matchday != null)?.matchday ?? null;

        const lastMatchday =
          lastMd != null
            ? past
                .filter((f) => f.matchday === lastMd)
                .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
            : past.slice(0, 5).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));

        const nextMatchday =
          nextMd != null
            ? upcoming
                .filter((f) => f.matchday === nextMd)
                .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
            : upcoming.slice(0, 5);

        return {
          entity: league,
          lastMatchday,
          nextMatchday,
          lastMatchdayNumber: lastMd,
          nextMatchdayNumber: nextMd,
        };
      });

      const teamPromises = teamEntities.map(async (team): Promise<TeamSection> => {
        const [pastRes, upRes] = await Promise.all([
          supabase
            .from('fixtures')
            .select(FIXTURE_COLS)
            .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
            .lt('kickoff_at', now)
            .order('kickoff_at', { ascending: false })
            .limit(5),
          supabase
            .from('fixtures')
            .select(FIXTURE_COLS)
            .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
            .gte('kickoff_at', now)
            .order('kickoff_at', { ascending: true })
            .limit(3),
        ]);
        return {
          entity: team,
          past: (pastRes.data ?? []) as unknown as FixtureRow[],
          upcoming: (upRes.data ?? []) as unknown as FixtureRow[],
        };
      });

      const [leagues, teams] = await Promise.all([
        Promise.all(leaguePromises),
        Promise.all(teamPromises),
      ]);

      return {
        leagues: leagues.filter((l) => l.lastMatchday.length > 0 || l.nextMatchday.length > 0),
        teams: teams.filter((t) => t.past.length > 0 || t.upcoming.length > 0),
      };
    },
    staleTime: 60 * 1000,
  });
}
