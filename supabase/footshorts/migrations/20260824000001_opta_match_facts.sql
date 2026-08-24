-- Footshorts: Opta match facts scraped from theanalyst.com's match centre
--
-- Provider-neutral per-side stats, one row per (fixture_id, side) — the same
-- fan-out shape as fixture_stats. Kept separate from fixture_stats (which is
-- fed by football-data.org) because Opta's stat set is richer (xG, pass
-- accuracy, big chances) and the two providers' numbers shouldn't overwrite
-- each other. Anything not modeled as a column lands in raw_stats jsonb, so
-- new stats on the page don't need a migration to be captured.
--
-- Written by worker/src/theanalystMatchFacts.ts; upserts on (fixture_id, side)
-- so cron re-runs are idempotent.

create table if not exists opta_match_facts (
  fixture_id           uuid not null references fixtures(id) on delete cascade,
  side                 text not null check (side in ('home', 'away')),
  -- Redundant with fixtures.theanalyst_match_id, but kept here too so this
  -- table is auditable standalone (fixture_events keeps team_id the same way).
  theanalyst_match_id  text not null,
  xg                   numeric,
  shots                int,
  shots_on_target      int,
  possession           int,                   -- percent 0-100
  passes               int,
  pass_accuracy        numeric,               -- percent 0-100
  big_chances          int,
  big_chances_missed   int,
  corners              int,
  fouls                int,
  yellow_cards         int,
  red_cards            int,
  offsides             int,
  raw_stats            jsonb,                 -- catch-all for stats not modeled above
  scraped_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (fixture_id, side)
);

create index if not exists idx_opta_match_facts_theanalyst_match
  on opta_match_facts (theanalyst_match_id);

-- RLS: public read, service-role write (same pattern as fixture_stats/fixture_events)

alter table opta_match_facts enable row level security;

drop policy if exists "opta_match_facts: public read" on opta_match_facts;
create policy "opta_match_facts: public read" on opta_match_facts for select using (true);

grant all on public.opta_match_facts to anon, authenticated, service_role;
