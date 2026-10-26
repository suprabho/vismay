-- 096: skipped editions — an edition with nothing scored is never published.
--
-- 2026-10-25: every Google News RSS feed answered 503 at 06:15 UTC, the
-- scrape stored nothing, the composer wrote its deterministic fallback with
-- zero stories (mood_score null) and the 09:00 publish froze it as edition
-- 33 — an empty public page. The fallback exists for a *model* failure, not
-- an empty window.
--
-- A third status, 'skipped': the composer marks an unscored draft skipped at
-- once, and the publish step marks (never publishes) an unscored draft. A
-- skipped row keeps its date and provenance so the admin archive shows the
-- gap, it never gets a number, the public readers (status = 'published')
-- never see it, and it frees the one-draft slot so the next morning's
-- composer is not blocked. A later recompose for that date (after a
-- backfill) turns it back into a draft: upsertDraftEdition only refuses a
-- published row, and the guard trigger only protects published rows.
--
-- Additive + idempotent.

alter table dc_editions drop constraint if exists dc_editions_status_check;
alter table dc_editions
  add constraint dc_editions_status_check check (status in ('draft', 'published', 'skipped'));

comment on column dc_editions.status is
  'draft (one at a time) → published (immutable, numbered) | skipped (nothing scored in the window: never published, no number, recompose reopens it as a draft)';
