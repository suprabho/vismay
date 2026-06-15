-- HeyGen template renders generated from the admin "HeyGen Studio" page.
--
-- Distinct from `story_videos`: those are our own headless Playwright+ffmpeg
-- renders, keyed `(slug, aspect, range, narration)` and tied to the audio
-- timeline. A HeyGen render is an avatar/template video produced by HeyGen's
-- API and pulled into our system — many can exist per story, so the natural
-- key is HeyGen's own `video_id`, with `slug` as the (non-unique) attach
-- target. We download the finished MP4 and re-upload it to the existing
-- `story-video` bucket under a `heygen/<slug>/` prefix so the asset survives
-- HeyGen's expiring URLs.
--
-- Lifecycle: a row is inserted `pending` the moment we kick off a render, then
-- the status poll route flips it to `completed` (with storage_path/public_url)
-- or `failed` once HeyGen finishes.

create table if not exists heygen_renders (
  id            bigint generated always as identity primary key,
  video_id      text not null unique,        -- HeyGen video id (poll key)
  slug          text not null,               -- attached story slug
  app_slug      text,                        -- owning vertical, e.g. 'footshorts'
  template_id   text not null,
  title         text,
  variables     jsonb,                       -- filled template variables sent to HeyGen
  dimension     jsonb,                       -- { width, height }
  test          boolean not null default false,  -- free watermarked preview
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'completed', 'failed')),
  storage_path  text,                        -- key within the story-video bucket
  public_url    text,                        -- our persisted Supabase URL
  thumbnail_url text,
  duration_ms   integer,
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_heygen_renders_slug
  on heygen_renders (slug);

alter table heygen_renders enable row level security;

create policy "Public read heygen renders"
  on heygen_renders for select
  using (true);
