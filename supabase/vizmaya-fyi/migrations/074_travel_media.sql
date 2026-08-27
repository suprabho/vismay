-- Travel app: per-item media manifest, moved from <slug>.media.yaml (git) to DB
-- so curation (tags, captions, selection, deletes) works against the deployed
-- app from the phone. One row per photo/video — small writes only, never a
-- whole-manifest blob. Service-role only, like travel_trips (073).
--
-- Apply by hand in the Supabase SQL editor (no CI applies migrations).
-- Seed from the git manifest with: pnpm travel:sync-media-db --slug <slug>

create table if not exists travel_trip_media (
  trip_slug  text not null,                -- story slug; no FK — trips are filesystem-mode
  file       text not null,                -- bucket key = <trip_slug>/<file> in story-assets
  kind       text not null default 'image' check (kind in ('image','video')),
  day        int,                          -- null = unassigned
  stop       text,                         -- stop slug from <slug>.trip.yaml; null = day-level
  caption    text,
  selected   boolean not null default true,-- false = hidden from all trip views (kept, recoverable)
  sort_order int,                          -- null = natural (filename) order; 0 = feature first
  taken_at   timestamptz,                  -- raw EXIF value (known IST-offset quirk; display only)
  match      text not null default 'manual' check (match in ('auto','manual')),
  original   text,                         -- source filename; prepare-media's dedupe key
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_slug, file)
);

alter table travel_trip_media enable row level security;
-- No policies: service-role access only.
