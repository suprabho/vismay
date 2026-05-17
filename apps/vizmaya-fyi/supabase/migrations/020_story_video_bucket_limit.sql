-- Ensure the story-video bucket exists and accepts MP4s up to 500MB.
-- 009_story_videos.sql created the metadata table but never the bucket
-- itself; the bucket was set up via the dashboard with the 50MB default
-- limit, which rejects rendered videos longer than ~9 min at 9:16.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('story-video', 'story-video', true, 524288000, array['video/mp4'])
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
