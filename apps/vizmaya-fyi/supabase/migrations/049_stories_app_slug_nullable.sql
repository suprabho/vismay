-- Allow stories to be UNASSIGNED (no owning app). Drafts created before an app
-- is chosen sit at null until an admin moves them. The FK is retained — Postgres
-- skips FK checks for NULL, so dropping NOT NULL is sufficient. No data backfill:
-- existing 'vizmaya-fyi' rows are left untouched.
alter table stories
  alter column app_slug drop default,
  alter column app_slug drop not null;
