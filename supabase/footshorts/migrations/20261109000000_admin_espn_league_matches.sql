-- ESPN fallback for league fixtures whose Opta match facts are missing.
--
-- theanalyst.com (the Opta match-facts source) has served a Cloudflare
-- managed challenge to the scraper since 2026-11-08. The match-facts workflow
-- now looks the same finished fixtures up on ESPN's public scoreboard and
-- stores ESPN's match detail (team stats, key events, line-ups, commentary)
-- HERE, written by apps/footshorts/worker/src/espnMatchFacts.ts.
--
-- Same private research boundary as admin_espn_cup_match_details: NOT
-- fixtures, fixture_events, opta_match_facts, opta_match_stories, share cards
-- or any consumer feed. The fixture is referenced, never written. The admin
-- Match facts tab and the admin HTML-stories brief read these rows through the
-- service role; nothing consumer-facing joins them. Storing it privately does
-- not change ESPN's terms or establish a reuse licence.

create table if not exists public.admin_espn_league_matches (
  fixture_id uuid primary key references public.fixtures (id) on delete cascade,
  espn_event_id text not null unique,
  espn_league_code text not null,   -- ESPN's league slug (esp.1, eng.1, …)
  competition_slug text not null,   -- our fixtures.competition_slug
  detail jsonb not null,            -- normalized EspnMatchDetail (shared/src/espnMatch.ts)
  raw_payload jsonb not null,       -- slimmed ESPN summary sections, for audit
  event_count integer not null default 0,
  has_team_stats boolean not null default false,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_espn_league_matches_competition
  on public.admin_espn_league_matches (competition_slug, fetched_at desc);

alter table public.admin_espn_league_matches enable row level security;
revoke all on public.admin_espn_league_matches from public, anon, authenticated;
grant select, insert, update, delete on public.admin_espn_league_matches to service_role;
comment on table public.admin_espn_league_matches is
  'ESPN match detail for league fixtures missing Opta facts: private admin review + HTML-stories brief only. No publishing or consumer access.';

-- The on/off switch for the automatic fallback, flipped on the admin Match
-- facts tab. One row (id is always true). Read by the worker before it makes
-- any ESPN request; a pasted ESPN link is an explicit request and runs either way.
create table if not exists public.admin_espn_fallback_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.admin_espn_fallback_settings (id, enabled) values (true, true)
  on conflict (id) do nothing;

alter table public.admin_espn_fallback_settings enable row level security;
revoke all on public.admin_espn_fallback_settings from public, anon, authenticated;
grant select, insert, update, delete on public.admin_espn_fallback_settings to service_role;
comment on table public.admin_espn_fallback_settings is
  'Admin switch for the ESPN match-facts fallback (worker espnMatchFacts.ts). Private.';
