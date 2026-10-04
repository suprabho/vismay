-- HTML stories — finished, self-contained HTML pages authored by any agent
-- (Claude, ChatGPT, Cursor, …) and hosted as-is at vizmaya.fyi/s/<slug>.
--
-- A separate pipeline from the viz-engine stories (`stories` table): there is
-- no config, no engine, no render step. The agent writes the final page; this
-- table just stores and serves it. Nothing here reads or writes the existing
-- story tables.
--
-- Read/write helpers: packages/html-stories/src/htmlStories.ts
-- Served by:          apps/vizmaya-fyi/app/s/[slug]/route.ts
-- Agent publish API:  apps/vizmaya-fyi/app/api/html-stories/route.ts
-- Admin UI:           apps/admin/app/vizmaya/(tabbed)/html-stories
--
-- Service-role only (RLS on, no policies): drafts must not be readable with
-- the anon key, and every reader is server-side.

create table if not exists html_stories (
  slug          text primary key,
  title         text not null,
  description   text,
  og_image_url  text,
  html          text not null,
  status        text not null default 'draft' check (status in ('draft','published','archived')),
  source        text,                 -- who posted the latest version: 'admin', 'api', 'mcp', …
  app_slug      text not null default 'vizmaya-fyi',
  published_at  timestamptz,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_html_stories_status on html_stories(status);
create index if not exists idx_html_stories_app_slug on html_stories(app_slug);

-- Append-only history: every save of new HTML lands here, so a bad re-post
-- from an agent can be rolled back from the admin editor.
create table if not exists html_story_versions (
  id          bigint generated always as identity primary key,
  slug        text not null references html_stories(slug) on delete cascade on update cascade,
  title       text not null,
  html        text not null,
  source      text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_html_story_versions_slug on html_story_versions(slug, created_at desc);

alter table html_stories enable row level security;
alter table html_story_versions enable row level security;
