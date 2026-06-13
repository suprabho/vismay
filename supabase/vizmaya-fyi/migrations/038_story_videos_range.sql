-- Generalize story_videos cache key from `preview` boolean to an explicit
-- `[range_start_ms, range_end_ms]` window over the cumulative audio timeline.
-- The existing `preview=true` case maps to (0, 20000); the existing full
-- render maps to (0, duration_ms). New variant renders (e.g. 5000–18000)
-- get their own row alongside the canonical full render.
--
-- The `preview` column is kept for one cycle so any in-flight reads from a
-- stale deploy don't crash; new writes only touch the range columns.
-- RENDER_PIPELINE_VERSION is bumped to v3 in lib/storyVideo.ts so any rows
-- with a placeholder range_end_ms (=0) re-render on next request.

alter table story_videos
  add column if not exists range_start_ms integer not null default 0;

alter table story_videos
  add column if not exists range_end_ms integer not null default 0;

-- Backfill: preview rows are (0, 20000); non-preview use duration_ms when
-- known, else 0 (will be re-rendered since the pipeline-version bump
-- invalidates the hash).
update story_videos
   set range_start_ms = 0,
       range_end_ms   = case
         when preview then 20000
         when duration_ms is not null then duration_ms
         else 0
       end
 where range_start_ms = 0
   and range_end_ms   = 0;

alter table story_videos
  drop constraint if exists story_videos_slug_aspect_preview_key;

-- Idempotent: drop the new key first so re-running this migration (or applying
-- it after a partial run) doesn't trip "constraint already exists". The columns
-- above are added with `if not exists`, so the whole file is safe to re-run.
alter table story_videos
  drop constraint if exists story_videos_slug_aspect_range_key;

alter table story_videos
  add constraint story_videos_slug_aspect_range_key
  unique (slug, aspect, range_start_ms, range_end_ms);
