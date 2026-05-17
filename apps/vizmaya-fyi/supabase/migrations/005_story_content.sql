-- Story content migration from filesystem to Postgres.
-- See docs/db-backed-content-plan.md for the design rationale (blob over normalized).

-- One row per story. Raw md / yaml kept as text so gray-matter + yaml.parse
-- run unchanged — the DB is just a versioned, queryable filesystem.
create table if not exists stories (
  slug          text primary key,
  title         text not null,
  status        text not null default 'published'
                check (status in ('draft', 'published', 'archived')),
  listed        boolean not null default true,
  markdown      text not null,
  config_yaml   text,
  share_yaml    text,
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_stories_status on stories(status);
create index if not exists idx_stories_listed on stories(listed) where listed = true;

-- Chart data currently served by /api/chart-data/[slug]/[id]. Composite key
-- mirrors the filesystem path content/stories/<slug>/charts/<id>.json.
create table if not exists chart_data (
  slug        text not null,
  chart_id    text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (slug, chart_id)
);

-- Snapshot on every save so editors can roll back. Cheap insurance against
-- the loss of git blame for content.
create table if not exists story_versions (
  id          bigint generated always as identity primary key,
  slug        text not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

create index if not exists idx_story_versions_slug on story_versions(slug, created_at desc);

-- RLS: anon/authenticated can read published stories; only service role writes.
-- Admin UI hits the DB through server routes using the service role client.
alter table stories enable row level security;
alter table chart_data enable row level security;
alter table story_versions enable row level security;

create policy "Public read published stories"
  on stories for select
  using (status = 'published');

create policy "Public read chart data"
  on chart_data for select
  using (true);

-- story_versions has no public read policy — service role only.
