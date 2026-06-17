-- Publish lifecycle + entity tagging for footshorts share cards.
--
-- The admin "Share cards" tool (migration 20260615010000) saved cards as drafts
-- only. This adds the plumbing to *ship* a card into the consumer product: a
-- rendered PNG (in the new public `footshorts-share-cards` bucket), a published
-- lifecycle, and entity tags so a card surfaces contextually — on the feed, in
-- For You, and on the team/league pages it's about. Mirrors how
-- `article_entities` drives article surfacing.

-- ── publish columns ─────────────────────────────────────────────────────────
alter table footshorts_share_cards
  add column if not exists status       text not null default 'draft',  -- draft | published
  add column if not exists image_url    text,                           -- public URL of the rendered PNG
  add column if not exists ratio        text,                           -- aspect ratio the PNG was captured at (e.g. "1:1")
  add column if not exists published_at timestamptz;

alter table footshorts_share_cards
  drop constraint if exists footshorts_share_cards_status_check;
alter table footshorts_share_cards
  add constraint footshorts_share_cards_status_check
    check (status in ('draft', 'published'));

-- The consumer lists newest-published-first; partial so drafts don't bloat it.
create index if not exists idx_footshorts_share_cards_published
  on footshorts_share_cards (published_at desc)
  where status = 'published';

-- ── entity tags (many-to-many, mirrors article_entities) ────────────────────
create table if not exists footshorts_share_card_entities (
  card_id   uuid not null references footshorts_share_cards(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  primary key (card_id, entity_id)
);

create index if not exists idx_footshorts_share_card_entities_entity
  on footshorts_share_card_entities (entity_id);

-- ── RLS: published cards (and their tags) are public-read; writes are
--        service-role only (the admin ship endpoint), same as articles. ──────
alter table footshorts_share_cards enable row level security;
alter table footshorts_share_card_entities enable row level security;

drop policy if exists "share_cards: public read published" on footshorts_share_cards;
create policy "share_cards: public read published"
  on footshorts_share_cards for select
  using (status = 'published');

drop policy if exists "share_card_entities: public read published" on footshorts_share_card_entities;
create policy "share_card_entities: public read published"
  on footshorts_share_card_entities for select
  using (
    exists (
      select 1 from footshorts_share_cards c
      where c.id = card_id and c.status = 'published'
    )
  );

-- ── storage: public bucket for the rendered PNGs ────────────────────────────
-- Public-read so the consumer feed / entity pages can <img> a card without
-- signing every URL. Writes go through the service role in the admin ship route
-- (bypasses RLS). Layout: `<card_id>.png`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'footshorts-share-cards',
    'footshorts-share-cards',
    true,
    10485760,  -- 10 MB; a 1080–1920px PNG is ~1–3 MB
    array['image/png']
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
