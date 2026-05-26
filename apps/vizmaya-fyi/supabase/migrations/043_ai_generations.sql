-- Audit + dedupe log for every call routed through @vismay/ai-gateway.
--
-- One row per generation (text or image). The (model, prompt, params) tuple
-- is hashed into request_hash so re-runs with identical inputs can hit the
-- same row instead of paying the gateway twice. That dedupe is also what
-- powers the admin "Regenerate" affordance: clicking it re-resolves the same
-- prompt and either returns the cached result or generates a fresh one.
--
-- Artifact storage differs by kind:
--   image  → result_ref holds the path in the story-assets bucket; bytes
--            live there, not in this table (they'd dwarf everything else).
--   text   → result_text holds the generated string inline.
--
-- story_slug is nullable so non-story generations (one-off scripts, eval
-- runs) can still log. RLS stays off — this table is service-role-only,
-- writes happen from API routes that already gate on the admin cookie.

create table if not exists ai_generations (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('image', 'text')),
  story_slug    text,
  prompt        text not null,
  model         text not null,
  -- Free-form: aspect ratio, seed, schema id, temperature, etc.
  params        jsonb not null default '{}'::jsonb,
  -- sha256(model || '\n' || prompt || '\n' || stable_json(params)). Computed
  -- in the app layer (cache.hashRequest) so we don't fight Postgres about
  -- canonical JSON ordering.
  request_hash  text not null,
  result_ref    text,
  result_text   text,
  created_at    timestamptz not null default now()
);

-- Dedupe + cache lookup — most-frequent query.
create index if not exists ai_generations_request_hash_idx
  on ai_generations (request_hash);

-- "Show me everything generated for this story, newest first" — drives the
-- per-story audit panel in admin.
create index if not exists ai_generations_story_slug_created_idx
  on ai_generations (story_slug, created_at desc)
  where story_slug is not null;
