-- Searching for Umami — a food/cuisine corpus scraped from TasteAtlas: the
-- top-rated dishes tagged under five Asian cuisines (India, China, Thailand,
-- Indonesia, Japan), with per-dish facts (region, category, ingredients,
-- rating, image/source URL) so the corpus can power a food epic landing and,
-- later, grounded sources in the story composer.
--
-- Source corpus + ingest notes: vizmaya-data/searching-for-umami/{README,INGEST_NOTES}.md
-- Scraper (local-run only — TasteAtlas blocks datacenter IPs):
--   apps/vizmaya-fyi/scripts/searching-for-umami/scrape-tasteatlas.ts
--   (pnpm searching-for-umami:scrape)
-- Importer: apps/vizmaya-fyi/scripts/searching-for-umami/import.ts
--   (pnpm searching-for-umami:import)
--
-- The unit of storage is one row per dish. The table is food-generic (keyed
-- by epic_slug, cuisine denormalized as a text slug) so future food epics
-- reuse it without new tables — same stance as book_articles in 068.
-- Rights note: `description` is a truncated 1–2 sentence summary (≤ ~400
-- chars), never TasteAtlas's full editorial text; `source_url` carries
-- attribution. The importer enforces the truncation bound.

create table if not exists food_dishes (
  id               uuid primary key default gen_random_uuid(),
  epic_slug        text not null references epics(slug) on delete cascade,
  slug             text not null,              -- TasteAtlas dish slug, kebab (e.g. 'butter-garlic-naan')
  name             text not null,
  cuisine          text not null,              -- lowercase cuisine slug: 'india' | 'china' | 'thailand' | 'indonesia' | 'japan'
  country_code     text,                       -- ISO-2 ('IN', 'CN', …) for future map use
  region           text,                       -- region/city of origin when the page gives one
  category         text,                       -- TasteAtlas food type ('Bread', 'Curry', 'Street Food', …)
  description      text not null,              -- truncated 1–2 sentence summary (rights: never full editorial text)
  ingredients      jsonb not null default '[]'::jsonb,  -- string[]
  rating           numeric(3,2),               -- TasteAtlas 0–5 star value, null if unrated
  rating_count     int,                        -- vote count when shown
  rank_in_cuisine  int,                        -- position in the top-N cuisine listing at scrape time
  image_url        text,
  source_url       text not null,              -- TasteAtlas dish page (attribution)
  tags             jsonb not null default '[]'::jsonb,  -- string[] (incl. 'listed-in:<cuisine>' for cross-cuisine dishes)
  scraped_at       timestamptz,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (epic_slug, slug)
);

create index if not exists idx_food_dishes_epic    on food_dishes(epic_slug);
create index if not exists idx_food_dishes_cuisine on food_dishes(epic_slug, cuisine, rank_in_cuisine);

alter table food_dishes enable row level security;

create policy "Public read food_dishes"
  on food_dishes for select
  using (true);

-- Seed the epic row. Draft + hidden from home — there's no landing page yet;
-- the corpus ships first (same rollout as global-trade and seriously-curious).
-- landing_component is metadata only while draft (nothing switches on it).
-- on-conflict keeps the seed authoritative on re-run.
insert into epics (
  slug, name, description, landing_component, status, app_slug, show_on_home,
  explainer, takeaways, keywords
)
  values (
    'searching-for-umami',
    'Searching for Umami',
    'A field guide to Asian cuisines, dish by dish — the top-rated foods of India, China, Thailand, Indonesia and Japan, with their regions, categories, key ingredients and ratings.',
    'food-dishes',
    'draft',
    'vizmaya-fyi',
    false,
    'A food corpus for the Searching for Umami epic: the top-rated dishes TasteAtlas tags under five Asian cuisines — India, China, Thailand, Indonesia and Japan. Each row is one dish with its region of origin, food category, key ingredients, community rating and source link, so stories can compare cuisines, map dishes to regions, and rank what the world actually eats.',
    '["Top-rated dishes across five Asian cuisines, one row per dish", "Per-dish facts: region, category, key ingredients, rating, source link", "India first, then China, Thailand, Indonesia and Japan", "Sourced from TasteAtlas listings; descriptions truncated, source_url carries attribution"]'::jsonb,
    '["food", "cuisine", "dishes", "india", "china", "thailand", "indonesia", "japan", "tasteatlas", "umami", "asian food"]'::jsonb
  )
  on conflict (slug) do update set
    name              = excluded.name,
    description       = excluded.description,
    landing_component = excluded.landing_component,
    status            = excluded.status,
    app_slug          = excluded.app_slug,
    show_on_home      = excluded.show_on_home,
    explainer         = excluded.explainer,
    takeaways         = excluded.takeaways,
    keywords          = excluded.keywords,
    updated_at        = now();
