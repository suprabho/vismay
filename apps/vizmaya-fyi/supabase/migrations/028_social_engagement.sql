-- Social engagement events from YouTube, LinkedIn, and X.
--
-- Single unified table — every platform's events normalise into one row so
-- the /admin/social inbox can stay platform-agnostic. The `parent_*` columns
-- capture "which post of mine drove this engagement" (YouTube video,
-- LinkedIn post URL, X tweet URL) — that's the grouping key for any
-- per-post dashboard we build later.
--
-- See docs/social-engagement-dashboard-plan.md for the multi-phase plan.

create table if not exists engagement_event (
  id uuid primary key default gen_random_uuid(),

  -- Where the event came from.
  platform text not null,                 -- youtube | linkedin | x
  external_id text not null,              -- platform's own id (comment id, email Message-ID, etc.)
  type text not null,                     -- mention | reply | comment | dm
  source_url text,                        -- deep link back to the platform

  -- The event itself.
  author_handle text,
  author_metadata jsonb,                  -- follower count, verified, etc. — sparse
  content text,
  created_at timestamptz not null,        -- the platform's timestamp

  -- The post / video that received the engagement. Used to group "top posts"
  -- in the dashboard. parent_external_id is the natural join key when one
  -- post has many comments (YouTube videoId, LinkedIn URN if we can parse it).
  parent_external_id text,
  parent_url text,
  parent_content text,                    -- short snippet — what they replied to

  -- Triage state.
  status text not null default 'new',     -- new | seen | replied | dismissed

  ingested_at timestamptz not null default now(),

  unique (platform, external_id)
);

create index if not exists engagement_event_status_created_idx
  on engagement_event (status, created_at desc);

create index if not exists engagement_event_platform_created_idx
  on engagement_event (platform, created_at desc);

create index if not exists engagement_event_parent_idx
  on engagement_event (platform, parent_external_id)
  where parent_external_id is not null;

-- Lock the table down. Every read/write path (the YouTube ingest script,
-- the email-ingest endpoint, the /admin/social routes) authenticates as
-- service_role, which bypasses RLS. Anon and authenticated clients get
-- zero access — this table holds DMs/replies/mentions and must not leak
-- through the public anon key shipped to the browser.
alter table engagement_event enable row level security;
