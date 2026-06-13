-- Footshorts: daily match-day recaps
-- One generated markdown recap per (date, scope). Produced by worker/src/recap.ts
-- after the last fixture of the day finishes. Consumed as an editorial brief by
-- the story-gen pipeline, so the column holds ready-to-read markdown.

create table if not exists daily_recaps (
  recap_date     date not null,
  -- 'all' = whole-day cross-competition recap; otherwise a competition_slug
  -- (e.g. "premier-league") for a single-league recap.
  scope          text not null default 'all',
  markdown       text not null,                     -- the recap.md content
  model          text,                              -- gemini model used for the narrative, null if deterministic-only
  fixture_count  int  not null default 0,           -- finished fixtures covered
  article_count  int  not null default 0,           -- stories woven in
  generated_at   timestamptz not null default now(),
  primary key (recap_date, scope)
);

create index if not exists idx_daily_recaps_date on daily_recaps (recap_date desc);

-- =====================================================
-- RLS: public read, service-role write (same pattern as fixtures/articles)
-- =====================================================

alter table daily_recaps enable row level security;

drop policy if exists "daily_recaps: public read" on daily_recaps;
create policy "daily_recaps: public read" on daily_recaps for select using (true);

-- PostgREST exposure (auto-grant trigger doesn't always fire for SQL-editor migrations)
grant all on public.daily_recaps to anon, authenticated, service_role;
