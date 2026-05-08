-- In-flight render tracking for story_pdfs.
--
-- Mirrors 011_story_videos_dispatched_at.sql. Without this column the
-- /api/story-pdf route had no way to tell that a workflow_dispatch was
-- already in flight, so each 3s poll from the /reports Download button
-- re-fired render-pdf.yml — one click stacked up to ~20 GitHub Actions
-- runs before the cache row finally landed.
--
-- We now write a stub row at dispatch time with `dispatched_at = now()`
-- and `public_url = ''`, so subsequent polls find the stub and return
-- 202 without re-dispatching. Stale stubs (older than DISPATCH_STALE_MS
-- in lib/storyPdf.ts) are treated as failed renders and re-dispatched
-- on demand.

alter table story_pdfs
  add column if not exists dispatched_at timestamptz;
