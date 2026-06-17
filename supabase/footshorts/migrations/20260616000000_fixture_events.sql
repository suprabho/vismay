-- Footshorts: API-Football identity bridge + per-match event log (goals, cards, subs)
--
-- football-data.org's free tier gives us scores + standings but no event-level
-- data (who scored, when). API-Football's free tier does, via
-- /fixtures/events?fixture={id}. The two providers use disjoint ids, so we carry
-- API-Football's id alongside the existing football_data_id:
--   - entities.api_football_id : league + team identity, seeded once (seed-af-ids.ts)
--   - fixtures.api_football_id : resolved lazily by the events worker, then reused
-- and store the events themselves in fixture_events.

-- =====================================================
-- API-Football identity, parallel to football_data_id
-- =====================================================

alter table entities  add column if not exists api_football_id int;
alter table fixtures  add column if not exists api_football_id int unique;

create index if not exists idx_entities_api_football_id on entities (api_football_id);

-- =====================================================
-- FIXTURE_EVENTS: one row per in-match event (goal / card / subst / var)
-- =====================================================

create table if not exists fixture_events (
  id            uuid primary key default gen_random_uuid(),
  fixture_id    uuid not null references fixtures(id) on delete cascade,
  -- The team that the event belongs to. team_id resolves to entities when the
  -- side is a tracked team; side ('home'/'away') is always set so the timeline
  -- can place the event even when the team isn't seeded (team_id null).
  team_id       uuid references entities(id) on delete set null,
  side          text check (side in ('home', 'away')),
  minute        int not null,                              -- API-Football time.elapsed
  extra_minute  int,                                       -- time.extra (added time), null otherwise
  type          text not null,                             -- goal | card | subst | var
  detail        text,                                      -- Normal Goal | Own Goal | Penalty | Yellow Card | Red Card | ...
  player_name   text,
  assist_name   text,                                      -- assisting player (goal) / player coming on (subst)
  updated_at    timestamptz not null default now(),
  -- Natural key so re-running the worker is idempotent. A player can legitimately
  -- have two events of the same type in a match, but not at the same minute.
  unique (fixture_id, minute, type, player_name)
);

create index if not exists idx_fixture_events_fixture on fixture_events (fixture_id, minute);

-- =====================================================
-- RLS: public read, service-role write (same pattern as fixtures/standings)
-- =====================================================

alter table fixture_events enable row level security;

drop policy if exists "fixture_events: public read" on fixture_events;
create policy "fixture_events: public read" on fixture_events for select using (true);

grant all on public.fixture_events to anon, authenticated, service_role;
