-- Freeform video editor — project library + render cache.
--
-- The video editor ( apps/admin/components/vizmaya/video/ ) lets an editor
-- upload media, place clips on a timeline with spatial transforms + entry/exit
-- animations, and export an MP4 via the existing Playwright + ffmpeg render
-- pipeline. Unlike a story, a project has no slug / markdown / sections — it's a
-- self-contained snapshot. This mirrors the vizmaya_share_cards model (061):
-- one row per project, opaque `config jsonb`, service-role writes, RLS enabled
-- with no public policy so the library stays admin-only.

create table if not exists video_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- '9:16' | '16:9' — the aspect the snapshot was last edited at.
  aspect      text,
  -- Opaque VideoProjectSnapshot (tracks + clips + transforms + anims) — JSON.
  config      jsonb not null,
  -- Project length in ms (denormalized from config for listing).
  duration_ms integer,
  -- Public URL of a rendered poster/thumbnail; reserved, null for now.
  thumb_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_video_projects_created_at
  on video_projects (created_at desc);

-- Touch updated_at on every update (mirrors vizmaya_share_cards).
create or replace function video_projects_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists video_projects_touch on video_projects;
create trigger video_projects_touch
  before update on video_projects
  for each row execute function video_projects_touch_updated_at();

-- Render cache — one row per (project, aspect, snapshot hash). Mirrors the
-- story_videos pattern: a stub row marks an in-flight dispatch (public_url '',
-- dispatched_at set); the renderer overwrites it with the final MP4. The hash
-- is sha256 over the snapshot, so any edit invalidates the cached render.
create table if not exists video_project_renders (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references video_projects(id) on delete cascade,
  aspect        text not null,
  snapshot_hash text not null,
  storage_path  text,
  public_url    text,
  duration_ms   integer,
  dispatched_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (project_id, aspect, snapshot_hash)
);

create index if not exists idx_video_project_renders_project
  on video_project_renders (project_id);

-- Writes go through the service role in the admin / render API (bypasses RLS);
-- enable RLS with no public policy so the library stays admin-only.
alter table video_projects enable row level security;
alter table video_project_renders enable row level security;
