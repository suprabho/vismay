-- Compose-from-sources: DB persistence for the canvas-native story composer.
--
-- Three additive changes:
--   1. stories.compose_state — the pipeline scaffold (phase, angles, outline)
--      for an in-progress draft; null when not composing or once finished.
--      Replaces the fs composer's .compose/<id>.json session store — the
--      session id collapses into the story slug.
--   2. story_sources — one row per uploaded file / pasted text / link, with its
--      extracted text. Originals live in the story-sources bucket so extraction
--      can be re-run with a better model later.
--   3. story-sources bucket — PRIVATE (unlike the public story-assets bucket);
--      source material is author input, not for public consumption.
--
-- Service-role only throughout, like ai_generations / chart_data: writes happen
-- from admin API routes that already gate on the admin cookie. RLS stays off.

-- 1. compose_state scaffold on the existing stories row.
alter table stories add column if not exists compose_state jsonb;

-- "List in-progress compose drafts, newest first" — the resume picker.
create index if not exists stories_compose_state_idx
  on stories (updated_at desc)
  where compose_state is not null;

-- 2. story_sources — raw ingested material per draft.
create table if not exists story_sources (
  id             uuid primary key default gen_random_uuid(),
  story_slug     text not null references stories(slug) on delete cascade,
  kind           text not null check (kind in ('file', 'link', 'text')),
  filename       text,
  storage_path   text,
  source_url     text,
  mime           text,
  title          text,
  byline         text,
  extracted_text text,
  status         text not null default 'pending'
                   check (status in ('pending', 'extracted', 'failed')),
  error          text,
  created_at     timestamptz not null default now()
);

-- "All sources for this draft, oldest first" — node hydration on canvas load.
create index if not exists story_sources_story_slug_idx
  on story_sources (story_slug, created_at);

-- 3. Private bucket for uploaded source originals.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'story-sources',
    'story-sources',
    false,
    104857600,
    array[
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/html',
      'text/csv',
      'application/json',
      'message/rfc822',
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
