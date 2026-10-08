-- What is trending today, for the randomizers: one snapshot per UTC day of
-- the most-engaged posts per beat (world news, business and tech, culture and
-- history, football), read from Xpoz (xpoz.ai: Reddit's top threads of the
-- day, X searches ranked by engagement). Every spin's brief carries the beats
-- its randomizer reads as context before the agent writes anything, and the
-- admin slot machine shows them.
--
-- Written by the daily job (.github/workflows/randomizer-trends.yml →
-- packages/randomizer/scripts/refresh-trends.ts). A re-run on the same day
-- replaces that day's row; a run where every search failed writes nothing, so
-- the brief keeps the last good day (and calls it stale after 36 hours).
--
-- Beats and rendering: packages/randomizer/src/trends.ts
-- Xpoz client, reads/writes: packages/randomizer/src/trendsServer.ts
--
-- Service-role only (RLS on, no policies), like randomizer_spins.

create table if not exists randomizer_trends (
  day           date primary key,
  as_of         timestamptz not null,
  -- 'partial' when some searches failed; each beat lists its failed sources.
  status        text not null default 'ok' check (status in ('ok','partial','failed')),
  -- [{ id, label, items: [{ platform, title, url, where, score, comments, postedAt }], errors: [] }]
  beats         jsonb not null default '[]'::jsonb,
  -- Searches the run made (each spends Xpoz credits).
  searches      integer not null default 0,
  refreshed_by  text,
  updated_at    timestamptz not null default now()
);

alter table randomizer_trends enable row level security;
