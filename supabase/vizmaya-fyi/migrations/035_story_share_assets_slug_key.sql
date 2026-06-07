-- Decouple story_share_assets from demos so social posts (and any future
-- caller) can render the same cards without needing a demo row.
--
-- Before: keyed on (demo_id, card_id, ratio). demo_id was both identity
-- and storage-path segment ({slug}/demo-{id}/{card}__{ratio}.png).
--
-- After: keyed on (story_slug, card_id, ratio). demo_id stays as a
-- nullable annotation for traceability when the demo render path is the
-- caller. Storage path drops the demo segment ({slug}/share/...).

alter table story_share_assets
  add column if not exists story_slug text;

-- Backfill story_slug from the demos join. After this runs the column
-- is fully populated; new rows must always set it.
update story_share_assets sa
  set story_slug = d.story_slug
  from demos d
  where sa.demo_id = d.id
    and sa.story_slug is null;

alter table story_share_assets
  alter column story_slug set not null;

-- Allow rows without a demo (social-post renders).
alter table story_share_assets
  alter column demo_id drop not null;

alter table story_share_assets
  drop constraint if exists story_share_assets_demo_id_card_id_ratio_key;

alter table story_share_assets
  add constraint story_share_assets_slug_card_ratio_key
  unique (story_slug, card_id, ratio);

create index if not exists idx_story_share_assets_slug
  on story_share_assets(story_slug);
