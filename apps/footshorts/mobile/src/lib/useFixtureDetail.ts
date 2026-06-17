import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

import type { FixtureRow, FixtureEvent } from '@vismay/footshorts-viz/types';
export type { FixtureRow, FixtureEvent };

export type FixtureDetail = {
  fixture: FixtureRow;
  events: FixtureEvent[];
};

// One fixture + its event log. Mirrors apps/footshorts/web/lib/useFixtureDetail.ts
// so the two platforms read the same shape. `phase` is selected here (unlike the
// list FIXTURE_COLS) because the detail header surfaces knockout context.
const DETAIL_COLS = `
  id, competition_slug, season, matchday, stage, phase, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url)
`;

export function useFixtureDetail(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['fixture-detail', fixtureId],
    enabled: !!fixtureId,
    queryFn: async (): Promise<FixtureDetail | null> => {
      const { data: fixture, error: fErr } = await supabase
        .from('fixtures')
        .select(DETAIL_COLS)
        .eq('id', fixtureId!)
        .maybeSingle();
      if (fErr) throw fErr;
      if (!fixture) return null;

      const { data: events, error: eErr } = await supabase
        .from('fixture_events')
        .select(
          'id, fixture_id, team_id, side, minute, extra_minute, type, detail, player_name, assist_name',
        )
        .eq('fixture_id', fixtureId!)
        .order('minute', { ascending: true });
      if (eErr) throw eErr;

      return {
        fixture: fixture as unknown as FixtureRow,
        events: (events ?? []) as FixtureEvent[],
      };
    },
    staleTime: 60 * 1000,
  });
}
