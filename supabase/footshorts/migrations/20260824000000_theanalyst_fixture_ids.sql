-- Footshorts: theanalyst.com (Opta) identity bridge on fixtures
--
-- theanalyst.com's Opta match centre addresses a match by three opaque string
-- ids (competitionId / seasonId / matchId — e.g. "73ob0ein8likagvlqcyqf4zys").
-- Like the football_data_id / api_football_id bridges already on this table,
-- these are resolved lazily by the match-facts worker (matchDiscovery.ts, by
-- team names + kickoff date) and then reused, so the name/date matching is a
-- one-time cost per fixture.

alter table fixtures add column if not exists theanalyst_competition_id text;
alter table fixtures add column if not exists theanalyst_season_id      text;
alter table fixtures add column if not exists theanalyst_match_id       text unique;

create index if not exists idx_fixtures_theanalyst_match_id on fixtures (theanalyst_match_id);
