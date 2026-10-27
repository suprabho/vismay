-- Section-wise narration for HTML stories.
--
-- Once a story is published, a GitHub Action (render-html-story-audio.yml →
-- packages/html-stories/scripts/generate-audio.ts) reads the page's sections
-- (packages/html-stories/src/narration.ts: its [data-unit], else [data-step],
-- else <section> elements), voices each one through the AI gateway and
-- writes one manifest row per story here. /s/<slug> reads the row and, when
-- it was made from the HTML being served, injects a "Listen" player that
-- plays the page section by section.
--
-- Clips are content-addressed in the public `story-audio` bucket
-- (html-stories/<slug>/<hash>.wav, hash = sha256 of voice + text), so a
-- re-post only voices the sections whose text changed.
--
-- `sections` is a JSON array, one entry per section in page order:
--   { index, label, hash, url, durationMs }   (url/hash null for a silent section)
-- `html_hash` is the sha256 of the document the manifest was made from; the
-- player is only offered while it matches the stored HTML.
--
-- Service-role only (RLS on, no policies), like html_stories.

create table if not exists html_story_audio (
  slug          text primary key references html_stories(slug) on delete cascade on update cascade,
  status        text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'failed')),
  html_hash     text,
  voice         text,
  sections      jsonb not null default '[]'::jsonb,
  duration_ms   integer not null default 0,
  error         text,
  requested_at  timestamptz not null default now(),
  generated_at  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table html_story_audio enable row level security;

notify pgrst, 'reload schema';
