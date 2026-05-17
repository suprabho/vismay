-- Rendered PDFs for story report + slides exports.
--
-- Mirrors 009_story_videos.sql but for static PDFs. One row per (slug, format).
-- Render path is Playwright `page.pdf()` against the bespoke /story/<slug>/report
-- and /story/<slug>/slides routes (no ffmpeg; PDFs need only Chromium).
-- Cache key `content_revision_hash` is sha256 over markdown + config.yaml +
-- share.yaml + report.yaml + sorted chart JSON for the slug, so any content
-- edit invalidates the cached PDF while a code-only redeploy doesn't.

create table if not exists story_pdfs (
  id                      bigint generated always as identity primary key,
  slug                    text not null,
  format                  text not null check (format in ('report', 'slides')),
  storage_path            text not null,
  public_url              text not null,
  content_revision_hash   text not null,
  created_at              timestamptz default now(),

  unique (slug, format)
);

create index if not exists idx_story_pdfs_slug
  on story_pdfs (slug);

alter table story_pdfs enable row level security;

create policy "Public read story pdfs"
  on story_pdfs for select
  using (true);

-- Storage bucket for the rendered files. Public-read so the polling client
-- can hand the URL to a browser download without signing.
insert into storage.buckets (id, name, public)
  values ('story-pdf', 'story-pdf', true)
  on conflict do nothing;

-- Per-story override config for the /reports builder (skip pages, custom
-- captions, chart/map overrides). Stored as a text yaml blob alongside
-- config_yaml / share_yaml so the same parser pattern applies.
alter table stories
  add column if not exists report_yaml text;
