'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { Entity } from './useEntities';
import type { FixtureRow } from './useFixtures';

const FIXTURE_COLS = `
  id, competition_slug, season, matchday, stage, kickoff_at, status,
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
  // For knockout rounds (no matchday). Mutually exclusive with the *Number fields.
  lastStage: string | null;
  nextStage: string | null;
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

// A fixture with both sides unresolved is a knockout slot before the draw —
// useless to display (no team, no outcome). Keep half-resolved rows.
function notTbd(f: FixtureRow): boolean {
  return f.home != null || f.away != null;
}

type RoundGroup = {
  fixtures: FixtureRow[];
  matchday: number | null;
  stage: string | null;
};

// Group the next/last "round" out of a kickoff-sorted list. League rounds use
// `matchday`; knockouts have `stage` (LAST_16, etc.) instead. We anchor on the
// first fixture's grouping key so the section header matches what the user sees.
function groupRound(fixtures: FixtureRow[], kind: 'past' | 'upcoming'): RoundGroup {
  if (fixtures.length === 0) return { fixtures: [], matchday: null, stage: null };
  const head = fixtures[0]!;
  const sortAsc = (a: FixtureRow, b: FixtureRow) => a.kickoff_at.localeCompare(b.kickoff_at);

  if (head.matchday != null) {
    const md = head.matchday;
    return {
      fixtures: fixtures.filter((f) => f.matchday === md).sort(sortAsc),
      matchday: md,
      stage: null,
    };
  }
  if (head.stage) {
    const stage = head.stage;
    return {
      fixtures: fixtures.filter((f) => f.stage === stage).sort(sortAsc),
      matchday: null,
      stage,
    };
  }
  const slice = fixtures.slice(0, 5);
  return {
    fixtures: kind === 'upcoming' ? slice : slice.sort(sortAsc),
    matchday: null,
    stage: null,
  };
}

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
        const past = ((pastRes.data ?? []) as unknown as FixtureRow[]).filter(notTbd);
        const upcoming = ((upRes.data ?? []) as unknown as FixtureRow[]).filter(notTbd);

        const lastGroup = groupRound(past, 'past');
        const nextGroup = groupRound(upcoming, 'upcoming');

        return {
          entity: league,
          lastMatchday: lastGroup.fixtures,
          nextMatchday: nextGroup.fixtures,
          lastMatchdayNumber: lastGroup.matchday,
          nextMatchdayNumber: nextGroup.matchday,
          lastStage: lastGroup.stage,
          nextStage: nextGroup.stage,
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
          past: ((pastRes.data ?? []) as unknown as FixtureRow[]).filter(notTbd),
          upcoming: ((upRes.data ?? []) as unknown as FixtureRow[]).filter(notTbd),
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
