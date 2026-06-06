-- Rendered MP4s for autoplay sessions.
--
-- One row per (slug, aspect). We render headlessly via Playwright + ffmpeg
-- (scripts/generate-video.ts) and upload to the `story-video` storage bucket.
-- The cache key `audio_revision_hash` is sha256 over the chunk URLs/durations
-- and per-cue start_ms/end_ms, so regenerating audio OR saving tuned cues
-- both invalidate the cached video automatically.

create table if not exists story_videos (
  id                    bigint generated always as identity primary key,
  slug                  text not null,
  aspect                text not null check (aspect in ('9:16', '16:9')),
  storage_path          text not null,
  public_url            text not null,
  audio_revision_hash   text not null,
  duration_ms           integer,
  created_at            timestamptz default now(),

  unique (slug, aspect)
);

create index if not exists idx_story_videos_slug
  on story_videos (slug);

alter table story_videos enable row level security;

create policy "Public read story videos"
  on story_videos for select
  using (true);
