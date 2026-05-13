-- Drop the per-story map override column added in 021.
--
-- 021 was reverted (commit d6419e1 → revert 633488e) because the autoplay
-- map override feature is being pulled. This migration removes the column
-- on environments where 021 was already applied. Safe to run regardless:
-- `drop column if exists` is a no-op if the column is missing.

alter table stories
  drop column if exists map_yaml;
