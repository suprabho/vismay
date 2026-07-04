-- Rendered HTML newsletters for the newsletter export surface.
--
-- Mirrors 010_story_pdfs.sql but for static HTML issues. One row per slug —
-- a story has exactly one current newsletter render, carrying two artifacts:
-- the inline-styled email HTML (`public_url`) and the stripped
-- Substack-paste variant (`substack_url`). Section visuals (maps, charts,
-- deck panels) are captured as PNGs into the same bucket and referenced by
-- absolute URL from both HTML documents.
--
-- Cache key `content_revision_hash` is sha256 over markdown + config.yaml +
-- newsletter.yaml + sorted chart JSON for the slug, so any content edit
-- invalidates the cached render while a code-only redeploy doesn't.

create table if not exists story_newsletters (
  id                      bigint generated always as identity primary key,
  slug                    text not null,
  storage_path            text not null,
  public_url              text not null,
  substack_url            text,
  content_revision_hash   text not null,
  -- Set when an async render is dispatched and not yet completed; cleared
  -- by the renderer's upsert. See classifyNewsletterState().
  dispatched_at           timestamptz,
  created_at              timestamptz default now(),

  unique (slug)
);

create index if not exists idx_story_newsletters_slug
  on story_newsletters (slug);

alter table story_newsletters enable row level security;

create policy "Public read story newsletters"
  on story_newsletters for select
  using (true);

-- Storage bucket for the rendered HTML + section PNGs. Public-read so the
-- email/Substack documents can reference the images by plain URL and the
-- HTML itself can be opened (or imported by Substack) without signing.
insert into storage.buckets (id, name, public)
  values ('story-newsletter', 'story-newsletter', true)
  on conflict do nothing;

-- Per-story newsletter config for the /newsletters builder (section
-- selection, intro/outro, CTA, captions). Stored as a text yaml blob
-- alongside config_yaml / share_yaml / report_yaml so the same parser
-- pattern applies.
alter table stories
  add column if not exists newsletter_yaml text;
