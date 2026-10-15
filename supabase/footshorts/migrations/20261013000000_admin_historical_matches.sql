-- Historical match results 2002/03 → today, bulk-loaded from the
-- vizmaya-data/football-seasons workspace (football-data.co.uk, engsoccerdata,
-- openfootball, martj42 internationals). Research/book material only:
-- deliberately NOT part of public fixtures, canonical entities, or consumer feeds.
-- Team names are raw source labels (no entity crosswalk yet).
-- Typed columns, no JSONB: keeps bulk upserts small (see shared-instance write wedge).

create table if not exists public.admin_historical_matches (
  id bigint generated always as identity primary key,
  match_date date not null,
  season text not null,                 -- source label, e.g. "2025-26" (internationals Aug–Jul)
  season_start integer not null,        -- 2025 for "2025-26"
  month text not null,                  -- "YYYY-MM", the book-chapter key
  competition text not null,            -- e.g. "Premier League", "Champions League", "Friendly"
  stage text,                           -- "League", "Q-2", "GroupA", "R16", … ; null for internationals
  home_team text not null,
  away_team text not null,
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  home_ht_score integer check (home_ht_score >= 0),
  away_ht_score integer check (away_ht_score >= 0),
  note text,                            -- internationals: venue / neutral ground
  source text not null,                 -- football-data.co.uk | engsoccerdata | openfootball-txt | martj42
  home_shots integer,
  away_shots integer,
  home_shots_on_target integer,
  away_shots_on_target integer,
  home_corners integer,
  away_corners integer,
  home_yellow_cards integer,
  away_yellow_cards integer,
  home_red_cards integer,
  away_red_cards integer,
  referee text,
  attendance integer,
  home_xg numeric(5,2),
  away_xg numeric(5,2),
  odds_b365_home numeric(7,2),
  odds_b365_draw numeric(7,2),
  odds_b365_away numeric(7,2),
  imported_at timestamptz not null default now(),
  constraint admin_historical_matches_natural_key
    unique (match_date, competition, home_team, away_team)
);

create index if not exists admin_historical_matches_season_comp
  on public.admin_historical_matches (season_start, competition, match_date);
create index if not exists admin_historical_matches_month
  on public.admin_historical_matches (month);
create index if not exists admin_historical_matches_home
  on public.admin_historical_matches (home_team, match_date);
create index if not exists admin_historical_matches_away
  on public.admin_historical_matches (away_team, match_date);

-- No consumer policies. Explicit revokes also override Supabase's automatic
-- grants to authenticated users (the consumer app has open signup).
alter table public.admin_historical_matches enable row level security;
revoke all on public.admin_historical_matches from public, anon, authenticated;
grant select, insert, update, delete on public.admin_historical_matches to service_role;
comment on table public.admin_historical_matches is
  'Historical results 2002→today (football-seasons workspace): private admin research only. No publishing or consumer access.';
