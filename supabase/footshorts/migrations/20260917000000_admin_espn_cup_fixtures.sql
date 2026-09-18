-- Private research/import area. Deliberately NOT part of public fixtures,
-- canonical entities, match facts, share cards, or consumer feeds.
create table public.admin_espn_cup_fixtures (
  espn_event_id text primary key,
  competition_slug text not null check (competition_slug in
    ('fa-cup', 'efl-cup', 'copa-del-rey', 'dfb-pokal', 'coppa-italia', 'coupe-de-france')),
  espn_competition_code text not null,
  season_start integer not null check (season_start >= 2000),
  round_label text,
  kickoff_at timestamptz,
  kickoff_time_confirmed boolean not null default false,
  status text not null check (status in
    ('scheduled', 'live', 'finished', 'postponed', 'cancelled', 'suspended', 'unknown')),
  status_detail text,
  home_espn_id text,
  away_espn_id text,
  home_team_name text not null,
  away_team_name text not null,
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  home_penalties integer check (home_penalties >= 0),
  away_penalties integer check (away_penalties >= 0),
  winner_espn_id text,
  venue text,
  notes jsonb not null default '[]'::jsonb,
  source_url text not null,
  raw_payload jsonb not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index admin_espn_cups_season_kickoff
  on public.admin_espn_cup_fixtures (season_start, competition_slug, kickoff_at);

-- No consumer policies. Explicit revokes also override Supabase's automatic
-- grants to authenticated users (the consumer app has open signup).
alter table public.admin_espn_cup_fixtures enable row level security;
revoke all on public.admin_espn_cup_fixtures from public, anon, authenticated;
grant select, insert, update, delete on public.admin_espn_cup_fixtures to service_role;
comment on table public.admin_espn_cup_fixtures is
  'ESPN domestic cups: private admin review only. No publishing or consumer access.';
