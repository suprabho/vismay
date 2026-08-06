-- 075_food_meal_plans.sql — Nashta breakfast planner (admin mini-app, /nashta).
--
-- One row per planning run: the user's free-text instructions, the parsed
-- constraints, the three AI-suggested breakfast combos (each item referencing
-- food_recipes ids), and — once a combo is selected — the merged shopping
-- list, prep-ahead notes and Hindi YouTube video picks.
--
-- RLS: NO anon policies, same posture as food_recipes (070) — plans embed
-- recipe-derived text from the rights-sensitive corpora, so this stays a
-- service-role/admin-only surface. Additive + idempotent; safe to re-run.

create table if not exists food_meal_plans (
  id             uuid primary key default gen_random_uuid(),
  plan_date      date not null,             -- the morning being planned (tomorrow at suggest time)
  instructions   text not null,             -- the user's raw "basic instructions"
  prefs          jsonb,                     -- parsed constraints {vegOnly, maxTotalMin, exclude[], household, notes}
  suggestions    jsonb not null,            -- the 3 combos [{title, rationale, items:[{recipeId, role}], …}]
  selected_index int,                       -- 0..2 once the user picks
  shopping_list  jsonb,                     -- {items:[…], prepAhead:[…]} after selection
  videos         jsonb,                     -- per-dish YouTube picks (or search-link fallbacks)
  status         text not null default 'suggested',  -- 'suggested' | 'finalized'
  model          text,                      -- gateway model that produced the suggestions
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists food_meal_plans_date_idx on food_meal_plans (plan_date desc, created_at desc);

alter table food_meal_plans enable row level security;
