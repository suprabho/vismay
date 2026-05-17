-- Track which articles each user has viewed, so we can dim seen stories
-- in the top rail and de-emphasize already-read cards in the feed.

create table article_views (
  user_id    uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (user_id, article_id)
);

-- Lookup by viewed_at for time-windowed reads + future pruning.
create index idx_article_views_user_time on article_views (user_id, viewed_at desc);

alter table article_views enable row level security;

create policy "article_views: users read own"
  on article_views for select using (auth.uid() = user_id);
create policy "article_views: users insert own"
  on article_views for insert with check (auth.uid() = user_id);
create policy "article_views: users delete own"
  on article_views for delete using (auth.uid() = user_id);

-- Daily prune of view rows older than 30 days. Keeps the per-user seen set
-- small (hundreds of rows) so the 7-day client snapshot query stays cheap.
create extension if not exists pg_cron;

select cron.schedule(
  'prune-article-views',
  '0 3 * * *',
  $$delete from article_views where viewed_at < now() - interval '30 days'$$
);
