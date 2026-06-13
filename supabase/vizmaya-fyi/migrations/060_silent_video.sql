-- No-narration ("silent") autoplay video support.
--
-- Two additive columns:
--
-- 1. stories.timing_yaml — per-unit dwell times that pace a silent video
--    (there's no audio timeline to drive the headless walk). Parsed by
--    packages/content-source/src/storyTiming.ts. Same `(parentIndex,
--    subIndex, sliceIndex)` unit identity as tts_yaml, so it survives
--    mobileParagraphs slice tweaks as long as the unit position is stable:
--
--      defaultMs: 5000
--      units:
--        - unit: { parentIndex: 0, subIndex: 0, sliceIndex: 0 }
--          ms: 3500
--
-- 2. story_videos.narration — distinguishes a narrated render from a silent
--    one for the same (slug, aspect, range). Existing rows are all narrated,
--    hence the `default true`. The cache unique key widens to include it so a
--    narrated and a silent render of the same window coexist instead of one
--    clobbering the other (and so the .silent.mp4 storage object never
--    collides with the narrated .mp4 — see videoStoragePath).
--
-- Both are read with graceful column-absent fallbacks in
-- packages/content-source/src/contentSource.ts and storyVideo.ts, so code may
-- ship before this migration is applied (the silent path simply no-ops /
-- cache-misses until the columns exist).

alter table stories
  add column if not exists timing_yaml text;

alter table story_videos
  add column if not exists narration boolean not null default true;

alter table story_videos
  drop constraint if exists story_videos_slug_aspect_range_key;

alter table story_videos
  add constraint story_videos_slug_aspect_range_narration_key
  unique (slug, aspect, range_start_ms, range_end_ms, narration);
