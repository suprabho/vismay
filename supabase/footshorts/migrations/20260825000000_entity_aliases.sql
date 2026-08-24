-- Editor-taught aliases for entity resolution.
--
-- entityResolver.ts already resolves scraped labels via exact match, then a
-- hardcoded ALIASES map ("Man Utd" -> "manchester-united") that only grows
-- through a code change + worker redeploy. This table lets the admin
-- "resolve identities" UI (Power rankings tab) teach the same mapping at
-- review time: picking a canonical entity for an unresolved raw label
-- upserts a row here, so the next scrape of that label resolves without a
-- code change. The worker's resolver reads this table alongside ALIASES.
--
-- alias_slug uses the exact normalize() rule in entityResolver.ts (lowercase,
-- strip accents, non-alnum runs -> single dash) so a scraped label and an
-- admin-entered label collapse to the same key.

create table if not exists entity_aliases (
  id          uuid primary key default gen_random_uuid(),
  entity_type entity_type not null,
  alias_slug  text not null,
  alias_label text not null,          -- raw label as scraped/entered, for display + audit
  entity_id   uuid not null references entities(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (entity_type, alias_slug)
);

create index if not exists idx_entity_aliases_entity on entity_aliases (entity_id);

-- RLS: admin-only table. No public policy — only the isAuthed()-gated admin
-- routes and the worker's entityResolver (both service-role) touch it.
alter table entity_aliases enable row level security;
