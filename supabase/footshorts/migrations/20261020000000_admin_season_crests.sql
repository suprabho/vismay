-- Club crests for the football-seasons books (vizmaya-data/football-seasons, Layer 6):
-- every top-flight club of a season and every cup opponent, with the crest picked
-- for that season (Logopedia / Wikidata / TheSportsDB) and, when an editor fills a
-- gap or replaces a wrong pick in the admin Books → Crests viewer, the uploaded file.
-- Research material only: no consumer access, never published.
-- Rows are pushed from data/crests.csv by `pnpm --filter @footshorts/worker
-- history:crests-sync -- --season=2003 --push`; a push never touches the upload columns.

create table if not exists public.admin_season_crests (
  season text not null,                   -- "2003-04"
  wiki text not null,                     -- club id: English Wikipedia article ("fr:…", "name:fr:…" for clubs without one)
  name text not null,                     -- as printed that season
  canonical_id text not null default '',  -- teams.csv crosswalk id, when known
  slug text not null default '',
  top_flight text not null default '',    -- Premier League | LaLiga | Serie A | Bundesliga | Ligue 1; blank = cup opponent
  competitions text not null default '',  -- " | "-joined
  country text not null default '',
  qid text not null default '',
  source text not null default '',        -- logopedia | wikidata | thesportsdb | '' (none found)
  era text not null default '',           -- season | current | ''
  era_label text not null default '',     -- the dated range, e.g. "1989–2004"
  file text not null default '',
  file_url text not null default '',
  thumb_url text not null default '',
  logopedia_page text not null default '',
  needs_review boolean not null default false,
  review_note text not null default '',
  -- Set only by the admin upload (private bucket admin-season-crests); wins over the picked crest.
  upload_path text,
  upload_type text,
  uploaded_by text,
  uploaded_at timestamptz,
  imported_at timestamptz not null default now(),
  primary key (season, wiki)
);

-- No consumer policies. Explicit revokes also override Supabase's automatic
-- grants to authenticated users (the consumer app has open signup).
alter table public.admin_season_crests enable row level security;
revoke all on public.admin_season_crests from public, anon, authenticated;
grant select, insert, update, delete on public.admin_season_crests to service_role;
comment on table public.admin_season_crests is
  'Football-seasons book club crests (picked + uploaded): private admin review only. No publishing or consumer access.';

-- Private bucket for uploaded crests: trademarked, mostly non-free images, so the
-- admin reads them through short-lived signed URLs. Layout: <season>/<slug>-<hash>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'admin-season-crests',
    'admin-season-crests',
    false,
    2097152,  -- 2 MB; a crest is a few KB of SVG or a small PNG
    array['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg', 'image/gif']
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
