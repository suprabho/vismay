-- Per-story binary asset bucket. Backs the new viz types (image / video /
-- rive / iframe poster) added by the viz module registry. Public-read so the
-- headless capture pipelines (PDF, video, share cards) and the live page can
-- pull assets without signing every URL.
--
-- Bucket layout: `<slug>/<filename>`. YAML references assets as
-- `assets://<slug>/<filename>`; lib/assetUrl.ts resolves them to public URLs.
--
-- MIME allowlist covers the four MVP modules:
--   image/*                       — image module
--   video/mp4                     — video module
--   application/octet-stream      — rive (.riv files have no registered MIME)
-- File cap is 100 MB — generous for editorial video clips while still
-- protecting against accidental multi-gigabyte uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'story-assets',
    'story-assets',
    true,
    104857600,
    array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/avif',
      'image/gif',
      'image/svg+xml',
      'video/mp4',
      'application/octet-stream'
    ]
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
