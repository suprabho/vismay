-- Footshorts: store the human-navigable theanalyst.com match-centre URL
-- alongside the opaque id triple already on fixtures (20260824000000).
--
-- Two producers: auto-discovery (matchDiscovery.ts) builds and stores this
-- for every match it resolves, and the admin's Match facts tab lets an editor
-- paste this same URL by hand for fixtures discovery couldn't match (a
-- borderline team-name nickname, a fixture outside the lookback window,
-- etc.) — the admin path parses competitionId/seasonId/matchId back out of
-- whatever theanalyst.com URL is pasted, so either producer keeps the ids and
-- the URL consistent with each other.

alter table fixtures add column if not exists theanalyst_match_url text;
