-- 070_food_recipes.sql — recipe corpora + ingredient vocabulary for the food
-- vertical (searching-for-umami epic, umami app).
--
-- Two local datasets feed these tables (raw CSVs live outside git under
-- vizmaya-data/, importer: apps/vizmaya-fyi/scripts/searching-for-umami/import-recipes.ts):
--
--   * archanas-kitchen — "6000+ Indian Food Recipes" (archanaskitchen.com via
--     Kaggle, 2022 snapshot): 6,871 Indian recipes with ingredients, times,
--     course/diet tags and FULL INSTRUCTIONS.
--   * culinarydb — CulinaryDB (CoSyLab, IIIT-Delhi, 2018): 45,772 recipes
--     across world cuisines as title + canonical ingredient sets (no
--     instructions), plus a 1,033-term ingredient vocabulary with categories
--     and compound constituents.
--
-- RLS: NO anon policies on purpose. Recipe instructions (and dataset license
-- terms — CulinaryDB is research-use, Archana's Kitchen text is the site's
-- editorial property) make these internal grounding/composer corpora, not
-- public API surface. food_dishes stays the only public-read food table.
-- Additive + idempotent; safe to re-run.

create table if not exists food_recipes (
  id           bigint generated always as identity primary key,
  source       text not null,            -- 'archanas-kitchen' | 'culinarydb'
  source_id    text not null,            -- Srno / Recipe ID within the source
  slug         text,                     -- stable per-source slug where derivable (AK url tail)
  title        text not null,            -- English title
  title_native text,                     -- original-language title when it differs
  cuisine      text,                     -- normalized epic cuisine slug (india/china/…) when confidently mappable
  cuisine_raw  text,                     -- the dataset's own label ('Bengali Recipes', 'Indian Subcontinent')
  course       text,
  diet         text,
  prep_min     int,
  cook_min     int,
  total_min    int,
  servings     int,
  ingredients  text[] not null default '{}',  -- cleaned ingredient names
  ingredients_raw text,                  -- source's raw ingredient string (grounding fidelity)
  instructions text,                     -- archanas-kitchen only; rights-sensitive, internal use
  url          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists food_recipes_cuisine_idx on food_recipes (cuisine);
create index if not exists food_recipes_source_idx  on food_recipes (source);
create index if not exists food_recipes_title_idx   on food_recipes (lower(title));
create index if not exists food_recipes_ingredients_gin on food_recipes using gin (ingredients);

alter table food_recipes enable row level security;

create table if not exists food_ingredients (
  entity_id    int primary key,          -- CulinaryDB entity id (compounds live at 2000+)
  name         text not null,
  synonyms     text[] not null default '{}',
  category     text,
  is_compound  boolean not null default false,
  constituents text[] not null default '{}'  -- compound ingredients only
);

alter table food_ingredients enable row level security;
