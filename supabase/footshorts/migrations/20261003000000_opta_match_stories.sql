-- Footshorts: Opta match-centre narrative cards (commentary + insights)
--
-- The match-centre widget renders a second panel beside the stat tables — an
-- "Opta-OS" card feed mixing minute-by-minute COMMENTARY with Opta's own
-- INSIGHTS, the season-context nuggets that read like a desk's own research:
--
--   INSIGHTS   98'    "Valencia have attempted 22 shots in this game, their
--                      highest total in a single match in the Primera División
--                      this season."
--   COMMENTARY 90+6'  "OFF! Will Valencia make their numerical advantage count
--                      now? They are a player up as Real Sociedad are reduced…"
--
-- None of this was captured before: the scraper read `table.Opta-Stats-Bars`
-- and `table.Opta-shotoverview` only. The cards come from the SAME page render
-- as the stats and the timeline (worker/src/theanalyst/matchCentre.ts →
-- extractMatchStories), so this costs zero extra fetches.
--
-- Why a separate table from fixture_events: events are the match's STRUCTURE
-- (one row per goal/card/sub, a closed vocabulary the MatchTimeline renders);
-- these are PROSE about it, several cards can share a minute, and an insight
-- often has no event at all. Mixing them would corrupt the timeline.
--
-- Written by worker/src/theanalystMatchFacts.ts; read by the compose match
-- brief (packages/content-source/src/footshortsMatchBrief.ts).

create table if not exists opta_match_stories (
  fixture_id           uuid not null references fixtures(id) on delete cascade,
  -- Document order on the page, which runs NEWEST FIRST (card 0 is the last
  -- thing that happened). Part of the key so a re-scrape overwrites in place.
  seq                  int not null,
  -- Redundant with fixtures.theanalyst_match_id, kept so the table is
  -- auditable standalone (opta_match_facts/fixture_events do the same).
  theanalyst_match_id  text not null,
  -- The card's own type label, normalized. 'match_preview' and
  -- 'pre_match_insight' are the build-up cards; they carry no minute.
  kind                 text not null check (kind in ('commentary', 'insight', 'pre_match_insight', 'match_preview')),
  minute               int,                   -- null on the pre-match cards
  extra_minute         int,                   -- "90+8'" → minute 90, extra 8
  side                 text check (side in ('home', 'away')),
  body                 text not null,
  scraped_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (fixture_id, seq)
);

create index if not exists idx_opta_match_stories_fixture_kind
  on opta_match_stories (fixture_id, kind);

create index if not exists idx_opta_match_stories_theanalyst_match
  on opta_match_stories (theanalyst_match_id);

-- RLS: public read, service-role write (same pattern as opta_match_facts)

alter table opta_match_stories enable row level security;

drop policy if exists "opta_match_stories: public read" on opta_match_stories;
create policy "opta_match_stories: public read" on opta_match_stories for select using (true);

grant all on public.opta_match_stories to anon, authenticated, service_role;
