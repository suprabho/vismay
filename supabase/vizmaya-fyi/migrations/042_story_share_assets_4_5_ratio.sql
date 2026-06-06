-- Allow the 4:5 portrait ratio (Instagram's native portrait crop, 1080×1350)
-- in story_share_assets. The original constraint (added in 014_demos.sql)
-- locked the column to ('1:1', '3:4', '4:3').
--
-- Renders for the new ratio are keyed alongside the existing three under the
-- same (story_slug, card_id, ratio) unique constraint — no other schema
-- changes are needed.

alter table story_share_assets
  drop constraint if exists story_share_assets_ratio_check;

alter table story_share_assets
  add constraint story_share_assets_ratio_check
  check (ratio in ('1:1', '4:5', '3:4', '4:3'));
