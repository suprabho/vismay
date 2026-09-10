-- Index for season-scoped fixture reads.
--
-- The fixtures sync upserts on football_data_id and never prunes, so `fixtures`
-- holds every season it has ever pulled (three-plus Champions League campaigns
-- by now). The app used to read it unscoped and ordered by kickoff, which meant
-- a new season opened on last season's knockout rounds under "Recent results"
-- and stacked several seasons' Matchday 1s into one round under "Schedule".
-- Every competition-scoped read now pins the season, so give that shape its own
-- index — idx_fixtures_competition_kickoff can't serve the season predicate.
create index if not exists idx_fixtures_competition_season_kickoff
  on fixtures (competition_slug, season, kickoff_at desc);
