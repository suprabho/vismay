-- 071_food_history.sql — dish & ingredient history/geography for the food
-- vertical (searching-for-umami epic, umami app).
--
-- AI-extracted, per-claim-cited events from Wikipedia (CC BY-SA — claims are
-- paraphrased facts; source_url + wiki_oldid carry attribution/permalink).
-- Worker: apps/vizmaya-fyi/scripts/searching-for-umami/enrich-history.ts
--   (pnpm searching-for-umami:enrich-history)
-- Review surface: admin umami History tab. Review-gated publishing: rows land
-- as status='ai-draft'; only 'reviewed' rows ever feed public surfaces (no
-- anon RLS yet — see the flip note at the bottom).
--
-- Subjects are (kind, slug): dishes mirror food_dishes.slug (single food epic
-- today — add epic_slug scoping if a second food epic lands, same caveat as
-- the food-dishes library provider); ingredients use curated canonical slugs
-- from scripts/searching-for-umami/history-subjects.ts (the ~92 raw
-- ingredient strings in dishes.json collapse to ~45 canonical subjects;
-- entity_id links to the CulinaryDB vocabulary where matchable). No FK to
-- food_dishes (its unique key is composite (epic_slug, slug)); dish subjects
-- are created FROM food_dishes rows by the worker, consistent by
-- construction. Additive + idempotent; safe to re-run.

create table if not exists food_history_subjects (
  kind             text not null check (kind in ('dish', 'ingredient')),
  slug             text not null,
  name             text not null,
  entity_id        int,               -- food_ingredients.entity_id when matchable (ingredients only)
  wiki_title       text,              -- resolved en.wikipedia article title
  wiki_url         text,              -- canonical page URL
  wiki_oldid       bigint,            -- revision id at last resolution (permalink)
  wiki_description text,              -- lead sentence-ish, for reviewer orientation
  wiki_resolved_at timestamptz,
  enriched_at      timestamptz,       -- last successful event extraction
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (kind, slug)
);

create table if not exists food_history_events (
  id            uuid primary key default gen_random_uuid(),
  subject_kind  text not null,
  subject_slug  text not null,
  kind          text not null,       -- 'origin'|'spread'|'introduction'|'etymology'|'cultivation'|'other'
                                     -- (worker-validated, no DB check so widening stays additive)
  date_text     text not null,       -- display string: '16th century', 'c. 3000 BCE', '1958'
  year_start    int,                 -- sortable; negative = BCE; null when unpindownable
  year_end      int,                 -- null for point-in-time events
  place         text,                -- as the source names it: 'Fujian', 'Persia', 'Punjab'
  country_code  text,                -- modern ISO-2 containing the place (aids geocode + future maps)
  lat           double precision,
  lng           double precision,
  claim         text not null,       -- ONE paraphrased, source-supported sentence
  claim_hash    text not null,       -- md5(normalized claim) — exact-dupe guard across re-runs
  source_url    text not null,       -- wiki page URL
  source_title  text,                -- wiki page title at extraction time
  wiki_oldid    bigint,              -- revision the claim was extracted from (permalink fidelity)
  model         text,                -- e.g. 'gemini-2.5-flash'
  confidence    text check (confidence in ('high', 'medium', 'low')),
  status        text not null default 'ai-draft'
                check (status in ('ai-draft', 'reviewed', 'rejected')),
  review_note   text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (subject_kind, subject_slug)
    references food_history_subjects (kind, slug) on delete cascade,
  unique (subject_kind, subject_slug, claim_hash)
);

create index if not exists idx_food_history_events_subject
  on food_history_events (subject_kind, subject_slug, year_start);
create index if not exists idx_food_history_events_status
  on food_history_events (status);
create index if not exists idx_food_history_events_kind
  on food_history_events (kind);

alter table food_history_subjects enable row level security;
alter table food_history_events  enable row level security;

-- NO anon policies on purpose: internal review-gated corpus for now (same
-- stance as food_recipes in 070). When the public umami timeline/map surface
-- ships, the flip is additive — apply as its own migration:
--   create policy "Public read reviewed food history"
--     on food_history_events for select using (status = 'reviewed');
--   create policy "Public read food history subjects"
--     on food_history_subjects for select using (true);
