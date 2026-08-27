-- AI Data Centers epic — daily AI-news recap snapshots.
--
-- One generated markdown brief per run over a trailing window (default 24h)
-- of the dc_news feed (migration 065): a Gemini-written overview + themed
-- sections, with the day's linked headlines and the tracked stocks' moves
-- woven in. Rows are INSERTED as snapshots (surrogate id, same pattern as
-- footshorts' rolling daily_recaps) so re-runs and manual dispatches keep a
-- timeline instead of clobbering the day.
--
-- Worker: apps/vizmaya-fyi/scripts/ai-data-centers/generate-news-recap.ts
-- Cron:   .github/workflows/generate-dc-news-recap.yml (daily, after the
--         06:45 UTC dc_news scrape)
-- Reader: getLatestDcNewsRecap / listDcNewsRecaps in
--         packages/content-source/src/epics.ts → /api/ai-data-centers/recap

create table if not exists dc_news_recaps (
  id            bigint generated always as identity primary key,
  window_hours  int not null default 24,
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  headline      text,                          -- LLM one-liner for cards/lists; null when deterministic-only
  markdown      text not null,                 -- the full recap, ready to render
  model         text,                          -- gemini model used, null if deterministic-only
  article_count int not null default 0,        -- relevant dc_news items covered
  topics        text[] not null default '{}',  -- union of topics across covered items
  tickers       text[] not null default '{}',  -- union of tickers across covered items
  generated_at  timestamptz not null default now()
);

create index if not exists idx_dc_news_recaps_generated
  on dc_news_recaps (generated_at desc);

alter table dc_news_recaps enable row level security;

create policy "Public read dc_news_recaps"
  on dc_news_recaps for select
  using (true);
