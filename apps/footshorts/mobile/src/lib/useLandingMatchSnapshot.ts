import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { FixtureRow } from './useFixtures';

/**
 * Recent results + next upcoming fixtures, for the top-of-page snapshot strip
 * on the mobile landing screen. Mirrors `useLandingMatchSnapshot` on web
 * (apps/footshort/web/app/page.tsx) so both surfaces show the same set.
 *
 * The `primary_color` column is requested here (and not in the regular
 * useFixtures hook) so MatchTile can theme itself to each team's brand.
 */

const SNAPSHOT_COLS = `
  id, competition_slug, season, matchday, stage, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url, primary_color),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url, primary_color)
`;

export function useLandingMatchSnapshot() {
  return useQuery({
    queryKey: ['landing', 'snapshot'],
    queryFn: async (): Promise<FixtureRow[]> => {
      const now = new Date().toISOString();
      const [past, upcoming] = await Promise.all([
        supabase
          .from('fixtures')
          .select(SNAPSHOT_COLS)
          .eq('status', 'finished')
          .lt('kickoff_at', now)
          .order('kickoff_at', { ascending: false })
          .limit(3),
        supabase
          .from('fixtures')
          .select(SNAPSHOT_COLS)
          .gte('kickoff_at', now)
          .order('kickoff_at', { ascending: true })
          .limit(6),
      ]);
      if (past.error) throw past.error;
      if (upcoming.error) throw upcoming.error;
      // Past in chronological order, then upcoming. Matches web's ordering so
      // a horizontal strip reads left→right "earliest played → next up".
      return [
        ...((past.data ?? []) as unknown as FixtureRow[]).reverse(),
        ...((upcoming.data ?? []) as unknown as FixtureRow[]),
      ];
    },
    staleTime: 60 * 1000,
  });
}
