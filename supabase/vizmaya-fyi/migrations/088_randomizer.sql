-- The Vizmaya story randomizers (Desk, Atlas, Epics): the spin log and the
-- Desk's live heat.
--
-- Every spin is logged (playbook 0.1): randomizer, reels, seed, the rules that
-- fired, and its status as it moves from spin to research to a published
-- story. The draw reads the last 90 days back for its repeat blocks and its
-- region, tradition and philosophical-quota balancing, so a spin is only ever
-- created by an authenticated call (admin session, or the publish token for
-- MCP and agents), never by the public brief URL.
--
-- Draw and datasets:  packages/randomizer/src/draw.ts, src/data/*.json
-- Read/write helpers: packages/randomizer/src/spins.ts
-- Agent endpoints:    apps/vizmaya-fyi/app/api/randomizer/**
-- Admin UI:           apps/admin/app/vizmaya/(tabbed)/randomizer
--
-- Service-role only (RLS on, no policies), like html_stories.

create table if not exists randomizer_spins (
  id               uuid primary key default gen_random_uuid(),
  randomizer       text not null check (randomizer in ('desk','atlas','epics')),
  status           text not null default 'spun'
                   check (status in ('spun','rejected','researching','insight_review','approved','published')),
  seed             text not null,
  -- The draw: what each reel landed on, the ids behind it, a snapshot of the
  -- records it drew (so the brief reads the same thing if the dataset
  -- changes), the 30-day and 90-day keys, and the balancing memory.
  reels            jsonb not null,
  picks            jsonb not null,
  subject          jsonb not null,
  primary_value    text not null,
  combo            text not null,
  summary          text not null,
  rules            jsonb not null default '[]'::jsonb,
  meta             jsonb not null default '{}'::jsonb,
  options          jsonb not null default '{}'::jsonb,   -- { locks, pair, sequence }
  -- Re-spins: the rejected spin keeps a one-tap reason; the new one points back.
  rejected_reason  text,
  respin_of        uuid references randomizer_spins(id) on delete set null,
  -- Research (decision D3: kept with the spin, so comments and follow-ups can
  -- find the claims log from the published story) and the hero insight gate.
  research_md      text,
  hero_insight     text,
  review_note      text,
  reviewed_by      text,
  story_slug       text,
  created_by       text not null default 'admin',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_randomizer_spins_log on randomizer_spins(randomizer, created_at desc);
create index if not exists idx_randomizer_spins_story on randomizer_spins(story_slug) where story_slug is not null;

-- Live heat per Desk sub-industry (playbook 1.3). The dataset's heat is a
-- seed; a refresh (the weekly agent job via the refresh_desk_heat MCP tool,
-- or POST /api/randomizer/heat) writes here. A failed refresh is recorded,
-- not swallowed: the admin shows it and the draw turns that segment's spins
-- Evergreen until a refresh succeeds.
create table if not exists desk_heat (
  sub_id          text primary key,
  heat            integer not null check (heat between 0 and 100),
  heat_updated    timestamptz,
  top_headlines   jsonb not null default '[]'::jsonb,   -- up to 3 { title, url, date }
  refresh_status  text not null default 'ok' check (refresh_status in ('ok','failed')),
  refresh_error   text,
  refreshed_by    text,
  updated_at      timestamptz not null default now()
);

alter table randomizer_spins enable row level security;
alter table desk_heat enable row level security;
