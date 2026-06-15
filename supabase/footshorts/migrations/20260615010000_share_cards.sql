-- Saved share-card drafts created in the admin "Share cards" tool. Each row is a
-- serializable snapshot of the creator's controls — card type, theme, ratio,
-- overlays, the picked fixture/news ids, and any generated AI image — so a card
-- can be reloaded and re-edited later. Data cards reference fixtures/news by id
-- and re-fetch fresh data on load; AI cards embed the image as a data URL.
create table footshorts_share_cards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  card_type   text not null,                          -- match | standings | form | news-image | news-article | ai-image
  config      jsonb not null,                         -- ShareCardSnapshot from the creator
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The gallery lists newest-first.
create index idx_footshorts_share_cards_created_at on footshorts_share_cards (created_at desc);
