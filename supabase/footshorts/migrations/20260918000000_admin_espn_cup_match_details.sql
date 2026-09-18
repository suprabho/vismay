-- ESPN match detail (key events, team stats when ESPN has them, lineups,
-- commentary) for imported cup fixtures. Same private research boundary as
-- admin_espn_cup_fixtures: NOT fixtures, fixture_events, opta_match_facts,
-- share cards or any consumer feed. The admin share-card studio reads these
-- rows through admin-only routes; nothing consumer-facing joins them.
create table if not exists public.admin_espn_cup_match_details (
  espn_event_id text primary key
    references public.admin_espn_cup_fixtures (espn_event_id) on delete cascade,
  competition_slug text not null,
  detail jsonb not null,        -- normalized EspnMatchDetail (shared/src/espnMatch.ts)
  raw_payload jsonb not null,   -- slimmed ESPN summary sections, for audit
  event_count integer not null default 0,
  has_team_stats boolean not null default false,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_espn_cup_match_details_competition
  on public.admin_espn_cup_match_details (competition_slug, fetched_at desc);

alter table public.admin_espn_cup_match_details enable row level security;
revoke all on public.admin_espn_cup_match_details from public, anon, authenticated;
grant select, insert, update, delete on public.admin_espn_cup_match_details to service_role;
comment on table public.admin_espn_cup_match_details is
  'ESPN match detail for domestic cups: private admin review + share-card source only. No publishing or consumer access.';
