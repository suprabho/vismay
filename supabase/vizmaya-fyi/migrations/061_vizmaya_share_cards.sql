-- Saved-card library for the admin Vizmaya "Share cards" composer.
--
-- The composer ( apps/admin/components/vizmaya/sharecard/ ) lets an editor build
-- an on-brand share card from a story's map / data, drop emojis + uploaded /
-- generated / asset images on top, preview live, and download a PNG. This table
-- backs the "Saved cards" library: each row is an opaque snapshot of the
-- composer's controls (`config`) plus a little metadata for listing + filtering.
--
-- Unlike footshorts_share_cards this has no publish lifecycle or entity tagging —
-- v1 is download + reloadable library only. `image_url` is reserved for a future
-- "save the rendered PNG" affordance; pure download leaves it null and needs no
-- storage bucket.

create table if not exists vizmaya_share_cards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Source story slug. Nullable so a plain map+caption / image-only card that
  -- isn't tied to a story can still be saved.
  story_slug  text,
  -- Card base: 'map' | 'data' | 'map-caption' (the composer's base picker).
  base_type   text not null,
  -- Aspect ratio the snapshot was last edited at (e.g. "1:1").
  ratio       text,
  -- Opaque VizmayaShareCardSnapshot (controller state + overlays) — JSON.
  config      jsonb not null,
  -- Public URL of a rendered PNG, set only if/when we persist one. Null for
  -- download-only cards.
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_vizmaya_share_cards_created_at
  on vizmaya_share_cards (created_at desc);

create index if not exists idx_vizmaya_share_cards_story
  on vizmaya_share_cards (story_slug);

-- Touch updated_at on every update (mirrors the social_post_plans trigger).
create or replace function vizmaya_share_cards_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists vizmaya_share_cards_touch on vizmaya_share_cards;
create trigger vizmaya_share_cards_touch
  before update on vizmaya_share_cards
  for each row execute function vizmaya_share_cards_touch_updated_at();

-- Writes go through the service role in the admin API (bypasses RLS); enable RLS
-- with no public policy so the library stays admin-only.
alter table vizmaya_share_cards enable row level security;
