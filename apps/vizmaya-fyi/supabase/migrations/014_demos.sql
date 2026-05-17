-- Per-client demo pages at /demo/<client_slug>.
--
-- One row per client. References an existing story; carries its own
-- editable copy (content_yaml), curated share-card list, and a per-demo
-- password. Multiple demos can wrap the same underlying story with
-- different copy / pricing / curation, and a story can be in `draft`
-- while a password-gated demo of it is live (the demo route reads via
-- service role, bypassing public RLS).

create table if not exists demos (
  id              bigint generated always as identity primary key,
  client_slug     text not null unique,
  client_name     text not null,
  story_slug      text not null references stories(slug) on delete cascade,
  password_hash   text not null,
  content_yaml    text,
  share_card_ids  jsonb,
  status          text not null default 'draft'
                  check (status in ('draft', 'live', 'archived')),
  published_at    timestamptz,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_demos_story_slug on demos(story_slug);

-- Service-role only. The public demo route reads after server-side
-- password verify, so anon clients never need direct access.
alter table demos enable row level security;

-- Curated share PNGs: each demo picks 6 cards × 3 ratios → 18 PNGs.
-- Cached by (demo_id, card_id, ratio). content_revision_hash invalidates
-- when the underlying story content changes.
create table if not exists story_share_assets (
  id                      bigint generated always as identity primary key,
  demo_id                 bigint not null references demos(id) on delete cascade,
  card_id                 text not null,
  ratio                   text not null check (ratio in ('1:1', '3:4', '4:3')),
  storage_path            text not null,
  public_url              text not null,
  content_revision_hash   text not null,
  dispatched_at           timestamptz,
  created_at              timestamptz default now(),

  unique (demo_id, card_id, ratio)
);

create index if not exists idx_story_share_assets_demo on story_share_assets(demo_id);

alter table story_share_assets enable row level security;

create policy "Public read story share assets"
  on story_share_assets for select
  using (true);

-- Public bucket so <img src> works without signed URLs.
insert into storage.buckets (id, name, public)
  values ('story-share', 'story-share', true)
  on conflict do nothing;

-- Extend story_videos with a `preview` flag so we can cache a 20-second
-- preview render alongside the full-length one. Cache key changes from
-- (slug, aspect) → (slug, aspect, preview).
alter table story_videos add column if not exists preview boolean not null default false;

alter table story_videos drop constraint if exists story_videos_slug_aspect_key;
alter table story_videos
  add constraint story_videos_slug_aspect_preview_key
  unique (slug, aspect, preview);

-- Extend story_pdfs with a first-page thumbnail PNG so the demo gallery
-- can show a preview without rasterising the PDF client-side.
alter table story_pdfs add column if not exists thumbnail_url text;
