-- Season events for the football-seasons book (vizmaya-data/football-seasons,
-- Layer 2): manager changes, notable transfers and Claude-extracted events, each
-- with its source. The admin "Season events" tab is where editors fact-check them
-- (verified / notes). Research material only: no consumer access, never published.
-- Rows are pushed from data/events.csv by `pnpm --filter @footshorts/worker
-- history:events-sync -- --push`; the hand check flows back with `--pull`.

create table if not exists public.admin_historical_events (
  id text primary key,                  -- sha1(origin|date|type|summary)[:16], same key as events.py
  season text not null,                 -- "2003-04"
  date text not null,                   -- YYYY-MM-DD, or YYYY-MM when the source gives only the month
  month text not null,                  -- YYYY-MM (chapter key)
  type text not null,                   -- manager_change | transfer | match | record | controversy | …
  importance smallint not null default 1 check (importance between 1 and 3),
  competition text not null default '',
  teams text not null default '',       -- crosswalk canonical ids, " | "-joined
  team_names text not null default '',
  people text not null default '',
  summary text not null,
  fee text not null default '',
  source_url text not null default '',
  origin text not null,                 -- wikipedia:managerial-changes | wikipedia:transfers | transfermarkt:transfers | claude:<article>
  source_page text not null default '',
  evidence text not null default '',    -- verbatim quote from the source article
  verified text not null default '' check (verified in ('', 'yes', 'fixed', 'no')),
  notes text not null default '',
  checked_by text,
  checked_at timestamptz,
  imported_at timestamptz not null default now()
);

create index if not exists admin_historical_events_season_date
  on public.admin_historical_events (season, date);

-- No consumer policies. Explicit revokes also override Supabase's automatic
-- grants to authenticated users (the consumer app has open signup).
alter table public.admin_historical_events enable row level security;
revoke all on public.admin_historical_events from public, anon, authenticated;
grant select, insert, update, delete on public.admin_historical_events to service_role;
comment on table public.admin_historical_events is
  'Football-seasons book events with their fact-check state: private admin review only. No publishing or consumer access.';
