-- ShortFoot: fixtures, fixture stats, standings
-- Phase 3 — powers league/team/player pages (past matches, results, stats)

-- =====================================================
-- FIXTURES: one row per match
-- =====================================================

create table if not exists fixtures (
  id                 uuid primary key default gen_random_uuid(),
  football_data_id   int unique,                        -- source match id; unique for upserts
  competition_slug   text not null,                     -- league entity slug, e.g. "premier-league"
  season             text not null,                     -- leagues: "25-26"; cups (single-year): "2025"
  matchday           int,
  -- team_id resolves to entities when the team is seeded; otherwise team_name carries the raw
  -- label from the source (e.g. early cup rounds vs non-tracked clubs). Exactly one of
  -- (team_id, team_name) must be set per side — see check constraint below.
  home_team_id       uuid references entities(id) on delete set null,
  away_team_id       uuid references entities(id) on delete set null,
  home_team_name     text,
  away_team_name     text,
  kickoff_at         timestamptz not null,
  status             text not null,                     -- scheduled | live | finished | postponed | cancelled
  home_score         int,                               -- full-time; null until finished/live
  away_score         int,
  home_ht_score      int,
  away_ht_score      int,
  venue              text,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  check ((home_team_id is not null) or (home_team_name is not null)),
  check ((away_team_id is not null) or (away_team_name is not null))
);

create index if not exists idx_fixtures_competition_kickoff on fixtures (competition_slug, kickoff_at desc);
create index if not exists idx_fixtures_home_team on fixtures (home_team_id, kickoff_at desc);
create index if not exists idx_fixtures_away_team on fixtures (away_team_id, kickoff_at desc);
create index if not exists idx_fixtures_status on fixtures (status);

-- =====================================================
-- FIXTURE_STATS: per-side match stats
-- Split into (fixture_id, side) rows so a single match fans out into home + away
-- =====================================================

create table if not exists fixture_stats (
  fixture_id         uuid not null references fixtures(id) on delete cascade,
  side               text not null check (side in ('home', 'away')),
  shots              int,
  shots_on_target    int,
  possession         int,                               -- percent 0–100
  corners            int,
  fouls              int,
  yellow_cards       int,
  red_cards          int,
  offsides           int,
  updated_at         timestamptz not null default now(),
  primary key (fixture_id, side)
);

-- =====================================================
-- STANDINGS: league table per competition/season
-- =====================================================

create table if not exists standings (
  competition_slug   text not null,
  season             text not null,                     -- same convention as fixtures.season
  team_id            uuid not null references entities(id) on delete cascade,
  position           int not null,
  played             int not null,
  won                int not null,
  draw               int not null,
  lost               int not null,
  goals_for          int not null,
  goals_against      int not null,
  goal_difference    int not null,
  points             int not null,
  form               text,                              -- e.g. "W,W,D,L,W" (last 5)
  updated_at         timestamptz not null default now(),
  primary key (competition_slug, season, team_id)
);

create index if not exists idx_standings_lookup on standings (competition_slug, season, position);

-- =====================================================
-- RLS: public read, service-role write (same pattern as articles/entities)
-- =====================================================

alter table fixtures enable row level security;
alter table fixture_stats enable row level security;
alter table standings enable row level security;

drop policy if exists "fixtures: public read" on fixtures;
drop policy if exists "fixture_stats: public read" on fixture_stats;
drop policy if exists "standings: public read" on standings;

create policy "fixtures: public read" on fixtures for select using (true);
create policy "fixture_stats: public read" on fixture_stats for select using (true);
create policy "standings: public read" on standings for select using (true);

-- =====================================================
-- Grants: required for PostgREST (the REST API) to expose these tables.
-- The auto-grant event trigger that ships with Supabase doesn't always fire
-- for migrations applied via the SQL editor, so grant explicitly.
-- =====================================================

grant all on public.fixtures       to anon, authenticated, service_role;
grant all on public.fixture_stats  to anon, authenticated, service_role;
grant all on public.standings      to anon, authenticated, service_role;
