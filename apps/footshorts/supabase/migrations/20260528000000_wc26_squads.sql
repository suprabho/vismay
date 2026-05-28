-- WC26 squads: per-country squad membership + club linkage.
--
-- Depends on:
--   * entities, entity_type enum (footshorts init, 20260420000000)
--   * fifa_wc26_teams (vizmaya-fyi 025_fifa_wc26.sql — same Supabase project)
--
-- Pattern: reuse entities(type='player') for the player row; football-specific
-- attributes go on player_profiles (1:1). wc26_squads is the squad-membership
-- table, with the player's club at call-up time (clubs drift during the year;
-- squad selection is a point-in-time snapshot). Unmatched clubs are queued for
-- admin review rather than auto-created, mirroring the article entity resolver.

create table if not exists player_profiles (
  entity_id          uuid primary key references entities(id) on delete cascade,
  date_of_birth      date,
  primary_position   text,
  height_cm          integer,
  foot               text
    check (foot is null or foot in ('left','right','both')),
  updated_at         timestamptz not null default now()
);

create table if not exists wc26_squads (
  country_code       text not null references fifa_wc26_teams(code) on delete cascade,
  player_entity_id   uuid not null references entities(id) on delete cascade,
  jersey             integer,
  position           text,
  role               text
    check (role is null or role in ('captain','vice_captain')),
  club_entity_id     uuid references entities(id),
  club_name_raw      text,
  photo_url          text,
  source             text not null
    check (source in ('wikipedia','press_release','manual')),
  announced_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (country_code, player_entity_id)
);

create index if not exists idx_wc26_squads_player on wc26_squads (player_entity_id);
create index if not exists idx_wc26_squads_club
  on wc26_squads (club_entity_id)
  where club_entity_id is not null;

create table if not exists wc26_squad_unmatched_clubs (
  id                 uuid primary key default gen_random_uuid(),
  country_code       text not null references fifa_wc26_teams(code) on delete cascade,
  club_name_raw      text not null,
  occurrences        integer not null default 1,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  resolved_to_entity_id uuid references entities(id),
  dismissed_at       timestamptz,
  unique (country_code, club_name_raw)
);

create index if not exists idx_wc26_squad_unmatched_open
  on wc26_squad_unmatched_clubs (last_seen_at desc)
  where resolved_to_entity_id is null and dismissed_at is null;

alter table player_profiles enable row level security;
alter table wc26_squads enable row level security;
alter table wc26_squad_unmatched_clubs enable row level security;

create policy "player_profiles: public read"
  on player_profiles for select using (true);
create policy "wc26_squads: public read"
  on wc26_squads for select using (true);
create policy "wc26_squad_unmatched_clubs: public read"
  on wc26_squad_unmatched_clubs for select using (true);

grant all on public.player_profiles to anon, authenticated, service_role;
grant all on public.wc26_squads to anon, authenticated, service_role;
grant all on public.wc26_squad_unmatched_clubs to anon, authenticated, service_role;

-- Flat read view: squad rows joined to player + club entities. The mobile/web
-- client reads this in a single round-trip per country. security_invoker so
-- RLS on the underlying tables still applies.
create or replace view wc26_squad_players with (security_invoker = true) as
select
  s.country_code,
  s.player_entity_id,
  p.slug          as player_slug,
  p.name          as player_name,
  p.country       as player_nationality,
  p.crest_url     as player_photo_url,
  pp.date_of_birth,
  pp.primary_position,
  pp.height_cm,
  pp.foot,
  s.jersey,
  s.position,
  s.role,
  s.club_entity_id,
  c.slug          as club_slug,
  c.name          as club_name,
  c.crest_url     as club_crest_url,
  c.primary_color as club_primary_color,
  s.club_name_raw,
  s.photo_url     as squad_photo_url,
  s.source,
  s.announced_at
from wc26_squads s
join entities p on p.id = s.player_entity_id and p.type = 'player'
left join player_profiles pp on pp.entity_id = s.player_entity_id
left join entities c on c.id = s.club_entity_id and c.type = 'team';

grant select on public.wc26_squad_players to anon, authenticated, service_role;
