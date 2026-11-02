-- Data packs for the season-book spreads: everything a team or league spread
-- draws that the match table can't give the admin (all-competition results,
-- cup runs, lineups, minutes, transfers). One row per pack version, so a spread
-- approved against a hash keeps reading that hash after a rebuild.
-- Rows are pushed from data/spread_packs/ by `pnpm --filter @footshorts/worker
-- history:spread-packs -- --season=2003 --push`. Book production material only:
-- no consumer access, never published.

create table if not exists public.admin_spread_packs (
  season_start integer not null,
  spread_key text not null,             -- 'team:arsenal', 'league:premier-league'
  hash text not null,                   -- sha256 of the pack's JSON
  pack jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season_start, spread_key, hash)
);

create index if not exists admin_spread_packs_latest
  on public.admin_spread_packs (season_start, spread_key, built_at desc);

-- No consumer policies. Explicit revokes also override Supabase's automatic
-- grants to authenticated users (the consumer app has open signup).
alter table public.admin_spread_packs enable row level security;
revoke all on public.admin_spread_packs from public, anon, authenticated;
grant select, insert, update, delete on public.admin_spread_packs to service_role;
comment on table public.admin_spread_packs is
  'Season-book spread data packs (vizmaya-data/football-seasons). Private to the admin Books tab.';
