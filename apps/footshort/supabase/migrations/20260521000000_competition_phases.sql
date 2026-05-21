-- Footshort: explicit phase model on fixtures and standings.
--
-- A competition has 1..N phases. Each phase is one of:
--   league    — round-robin table (Premier League, UCL league phase)
--   group     — multiple round-robin tables (World Cup groups, old UCL)
--   knockout  — single-elimination ties (FA Cup, UCL R16+)
--
-- Before this migration, phase was implicit: `matchday` distinguished league
-- rounds, `stage` carried knockout round codes, and group-stage cups were
-- unrepresentable because standings PK was (slug, season, team_id) — only one
-- row per team. This adds `phase` (and `group_label` on standings) and widens
-- the standings PK so the same team can appear in different groups in
-- different seasons or across phases.

-- =====================================================
-- FIXTURES: explicit phase
-- =====================================================

alter table fixtures
  add column if not exists phase text;

-- Backfill phase from existing stage/matchday data. football-data.org emits:
--   GROUP_STAGE                                  → group rounds
--   LEAGUE_STAGE                                 → UCL league phase (2024+)
--   REGULAR_SEASON / (null) + non-null matchday  → standard league rounds
--   knockout stage codes (allowlisted below)     → knockout ties
-- The allowlist beats a deny-list: stage='REGULAR_SEASON' for Bundesliga
-- league matches was previously mis-classified as knockout when we used
-- "stage is not null then knockout".
update fixtures
set phase = case
  when stage = 'GROUP_STAGE' then 'group'
  when stage = 'LEAGUE_STAGE' then 'league'
  when stage in (
    'PRELIMINARY_ROUND', 'FIRST_QUALIFYING_ROUND',
    'SECOND_QUALIFYING_ROUND', 'THIRD_QUALIFYING_ROUND',
    'PLAY_OFFS', 'PLAY_OFF_ROUND',
    'ROUND_OF_32', 'ROUND_OF_16', 'LAST_16',
    'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'
  ) then 'knockout'
  when matchday is not null then 'league'
  else null
end
where phase is null;

-- Fix-up for anyone who already ran an earlier version of this migration
-- (which used the deny-list and mislabeled REGULAR_SEASON etc as knockout).
-- No-op on a clean apply.
update fixtures
set phase = case when matchday is not null then 'league' else null end
where phase = 'knockout'
  and stage not in (
    'PRELIMINARY_ROUND', 'FIRST_QUALIFYING_ROUND',
    'SECOND_QUALIFYING_ROUND', 'THIRD_QUALIFYING_ROUND',
    'PLAY_OFFS', 'PLAY_OFF_ROUND',
    'ROUND_OF_32', 'ROUND_OF_16', 'LAST_16',
    'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'
  );

create index if not exists idx_fixtures_phase
  on fixtures (competition_slug, season, phase)
  where phase is not null;

-- =====================================================
-- STANDINGS: phase + group label, wider PK
-- =====================================================

alter table standings
  add column if not exists phase text not null default 'league';

alter table standings
  add column if not exists group_label text not null default '';

-- PK swap: include group_label so multiple groups within the same competition
-- /season don't collide. Idempotent — both branches no-op if the desired state
-- is already in place.
do $$
declare
  pk_col_count int;
begin
  select array_length(conkey, 1) into pk_col_count
  from pg_constraint
  where conname = 'standings_pkey'
    and conrelid = 'public.standings'::regclass;

  -- Existing PK is the old (slug, season, team_id) shape — drop it so we can
  -- widen. If pk_col_count is already 4 we've migrated; if null there's no PK
  -- at all (shouldn't happen, but the add below covers it).
  if pk_col_count = 3 then
    alter table standings drop constraint standings_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'standings_pkey'
      and conrelid = 'public.standings'::regclass
  ) then
    alter table standings
      add constraint standings_pkey
      primary key (competition_slug, season, group_label, team_id);
  end if;
end $$;

-- Replace the old (slug, season, position) lookup index with one that also
-- discriminates by group_label so group-table queries hit a tight scan.
drop index if exists idx_standings_lookup;
create index if not exists idx_standings_lookup
  on standings (competition_slug, season, group_label, position);
