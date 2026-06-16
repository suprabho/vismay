-- Footshorts: shift recaps from calendar-day to rolling "last X hours" snapshots.
--
-- The recap worker (worker/src/recap.ts) now generates over a trailing time window
-- ending "now" (default 24h) rather than a fixed UTC day, and INSERTS a new snapshot
-- row each run (no upsert) so the admin keeps a timeline of recaps. Identity moves
-- from the composite (recap_date, scope) key to a surrogate `id`. Table name kept as
-- `daily_recaps` to avoid churn, but rows are no longer one-per-day.

-- Drop the old composite primary key.
alter table daily_recaps drop constraint if exists daily_recaps_pkey;

-- New columns: surrogate id + the window the snapshot covers.
alter table daily_recaps
  add column if not exists id           uuid not null default gen_random_uuid(),
  add column if not exists window_hours int  not null default 24,
  add column if not exists window_start timestamptz,
  add column if not exists window_end   timestamptz;

-- Backfill window bounds for any pre-existing daily rows: treat the old recap_date
-- as the 24h UTC day it covered (midnight to the next midnight).
update daily_recaps
   set window_start = coalesce(window_start, recap_date::timestamptz),
       window_end   = coalesce(window_end,   recap_date::timestamptz + interval '24 hours')
 where recap_date is not null
   and (window_start is null or window_end is null);

-- Fallback for anything still unbounded (shouldn't occur): the 24h before generation.
update daily_recaps
   set window_start = coalesce(window_start, generated_at - interval '24 hours'),
       window_end   = coalesce(window_end,   generated_at)
 where window_start is null or window_end is null;

alter table daily_recaps
  alter column window_start set not null,
  alter column window_end   set not null;

alter table daily_recaps add primary key (id);

-- recap_date is superseded by the window columns.
alter table daily_recaps drop column if exists recap_date;

-- Index for the admin timeline (newest first).
drop index if exists idx_daily_recaps_date;
create index if not exists idx_daily_recaps_generated on daily_recaps (generated_at desc);
