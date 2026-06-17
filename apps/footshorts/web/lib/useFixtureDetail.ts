'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

import type { FixtureRow, FixtureEvent } from '@vismay/footshorts-viz/types';
export type { FixtureEvent };

// Same fixture projection useFixtures uses (team entities joined for crest/name),
// kept in sync so a fixture read here matches one read in a list.
const FIXTURE_COLS = `
  id, competition_slug, season, matchday, stage, phase, kickoff_at, status,
  home_score, away_score, home_team_name, away_team_name,
  home:entities!fixtures_home_team_id_fkey(id, slug, name, crest_url),
  away:entities!fixtures_away_team_id_fkey(id, slug, name, crest_url)
`;

const EVENT_COLS =
  'id, fixture_id, team_id, side, minute, extra_minute, type, detail, player_name, assist_name';

export type FixtureDetail = {
  fixture: FixtureRow;
  events: FixtureEvent[];
};

/**
 * A single fixture plus its event timeline (goals/cards/subs), by fixture id.
 * Returns null when no such fixture exists so the page can render a not-found
 * state rather than spin forever.
 */
export function useFixtureDetail(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['fixture-detail', fixtureId],
    enabled: !!fixtureId,
    queryFn: async (): Promise<FixtureDetail | null> => {
      const { data: fixture, error: fErr } = await supabase
        .from('fixtures')
        .select(FIXTURE_COLS)
        .eq('id', fixtureId!)
        .maybeSingle();
      if (fErr) throw fErr;
      if (!fixture) return null;

      const { data: events, error: eErr } = await supabase
        .from('fixture_events')
        .select(EVENT_COLS)
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
