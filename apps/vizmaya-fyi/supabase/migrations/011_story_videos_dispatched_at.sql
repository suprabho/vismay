-- In-flight render tracking for story_videos.
--
-- Without this, every poll from the autoplay Download button (every 15s for
-- up to 15 min) re-dispatched a fresh GitHub Actions workflow because the
-- API route's only "render in progress?" signal was a cache row, which
-- doesn't exist until the render completes. One click → up to 60 dispatches.
--
-- We now write a stub row at dispatch time with `dispatched_at = now()` and
-- `public_url = ''`, so subsequent polls find the stub and return 202
-- without re-dispatching. Stale stubs (older than ~30 min, longer than any
-- reasonable render) are treated as failed and re-dispatched on demand.

alter table story_videos
  add column if not exists dispatched_at timestamptz;
