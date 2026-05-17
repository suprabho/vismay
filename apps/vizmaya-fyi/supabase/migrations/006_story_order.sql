-- Add display_order column for explicit story sorting on home page.
-- 0-indexed, lower numbers appear first. Null defaults to unordered.

alter table stories add column display_order integer;
create index if not exists idx_stories_display_order on stories(display_order);
