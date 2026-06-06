-- Canva Connect API bridge.
--
-- Two tables:
--   canva_tokens   single-row token store for the org's Canva account
--   canva_designs  one row per push from a cached autoplay MP4 into Canva
--
-- The admin Narration tab adds a "Send to Canva" button next to each
-- aspect's video render. Clicking it streams the existing MP4 from the
-- `story-video` bucket up to Canva via /v1/asset-uploads, then creates a
-- Canva design with the asset and records the design id + edit url here.
-- If a row already exists for `(slug, aspect)`, the UI flips the button
-- to "Open in Canva" instead of re-uploading.
--
-- OAuth model is single-tenant: one Canva account drives every push. The
-- bootstrap flow (scripts/canva-bootstrap.ts) does an interactive PKCE
-- authorization once and writes the access + refresh tokens into the
-- single canva_tokens row (id = 1). Subsequent server calls refresh
-- silently via the refresh_token whenever access_token is near expiry.

create table if not exists canva_tokens (
  id            smallint primary key default 1,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  updated_at    timestamptz not null default now(),

  -- Enforce single-row. Anything trying to insert a second row fails.
  constraint canva_tokens_singleton check (id = 1)
);

alter table canva_tokens enable row level security;
-- No public policies — service-role only. Tokens never leave the server.

create table if not exists canva_designs (
  id              bigint generated always as identity primary key,
  slug            text not null,
  aspect          text not null check (aspect in ('9:16', '16:9')),
  asset_id        text not null,
  design_id       text not null,
  edit_url        text not null,
  thumbnail_url   text,
  pushed_at       timestamptz not null default now(),

  unique (slug, aspect)
);

create index if not exists idx_canva_designs_slug
  on canva_designs (slug);

alter table canva_designs enable row level security;

create policy "Public read canva designs"
  on canva_designs for select
  using (true);
