-- VizF1 schema v1
-- All tables and enums are namespaced with `vizf1_` so they can co-exist in
-- the project-wide Supabase project alongside vizmaya and footshorts schemas.
-- footshorts's existing `articles` / `article_entities` would otherwise collide.

-- One-time cleanup of un-prefixed tables from a previous (failed) draft run.
-- These names are NOT used by vizmaya or footshorts (verified at migration
-- time) so it's safe to drop them. Do NOT add `articles` / `article_entities`
-- here — those belong to footshorts.
drop table if exists session_results cascade;
drop table if exists sessions cascade;
drop table if exists story_segments cascade;
drop table if exists races cascade;
drop table if exists circuits cascade;
drop table if exists drivers cascade;
drop table if exists constructors cascade;
drop type if exists session_type cascade;
drop type if exists article_entity_type cascade;

-- =====================================================
-- DRIVERS
-- =====================================================

create table vizf1_drivers (
  driver_id         text primary key,                   -- jolpica/ergast id, e.g. "max_verstappen"
  given_name        text not null,
  family_name       text not null,
  code              text,                               -- e.g. "VER"
  permanent_number  text,
  nationality       text,
  date_of_birth     date,
  -- assets
  headshot_url      text,                               -- from OpenF1
  -- denormalised current-season team for fast joins
  constructor_id    text,
  primary_color     text,                               -- hex, mirrors vizf1_constructors.primary_color
  updated_at        timestamptz not null default now()
);

create index idx_vizf1_drivers_constructor on vizf1_drivers (constructor_id);

-- =====================================================
-- CONSTRUCTORS
-- =====================================================

create table vizf1_constructors (
  constructor_id    text primary key,                   -- jolpica id, e.g. "red_bull"
  name              text not null,
  nationality       text,
  primary_color     text,                               -- hex
  logo_slug         text,                               -- matches @vizf1/brand/src/logos/<slug>.svg
  updated_at        timestamptz not null default now()
);

-- =====================================================
-- CIRCUITS
-- =====================================================

create table vizf1_circuits (
  circuit_id        text primary key,                   -- jolpica id, e.g. "monza"
  name              text not null,
  locality          text,
  country           text,
  lat               double precision,
  lng               double precision,
  -- track outline derived from OpenF1 /location data, normalised to 0..1000 viewBox
  track_path_svg    text,                               -- SVG `d` attribute
  track_bounds      jsonb,                              -- { minX, maxX, minY, maxY } in source coords
  updated_at        timestamptz not null default now()
);

-- =====================================================
-- RACES
-- =====================================================

create table vizf1_races (
  id                uuid primary key default gen_random_uuid(),
  season            text not null,                      -- "2026"
  round             int not null,                       -- 1..24
  race_name         text not null,
  circuit_id        text references vizf1_circuits(circuit_id),
  date              date not null,                      -- race day
  time              text,                               -- "13:00:00Z" or null
  has_sprint        boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique (season, round)
);

create index idx_vizf1_races_date on vizf1_races (date);

-- =====================================================
-- SESSIONS: FP1, FP2, FP3, Qualifying, Sprint Q, Sprint, Race
-- =====================================================

create type vizf1_session_type as enum ('fp1', 'fp2', 'fp3', 'quali', 'sprint_quali', 'sprint', 'race');

create table vizf1_sessions (
  id                  uuid primary key default gen_random_uuid(),
  race_id             uuid not null references vizf1_races(id) on delete cascade,
  session_type        vizf1_session_type not null,
  -- OpenF1 keys for cross-referencing
  session_key_openf1  int,                              -- /sessions session_key
  started_at          timestamptz,
  status              text not null default 'pending',  -- pending | live | finished
  updated_at          timestamptz not null default now(),
  unique (race_id, session_type)
);

create index idx_vizf1_sessions_race on vizf1_sessions (race_id);
create index idx_vizf1_sessions_type on vizf1_sessions (session_type);

-- =====================================================
-- SESSION RESULTS: per-driver row per session
-- Race + sprint use position + points; practice uses best_lap_ms.
-- =====================================================

create table vizf1_session_results (
  session_id        uuid not null references vizf1_sessions(id) on delete cascade,
  driver_id         text not null references vizf1_drivers(driver_id),
  position          int,
  best_lap_ms       int,                                -- practice & qualifying
  laps_completed    int,
  points            real,                               -- race / sprint
  status            text,                               -- "Finished", "+1 Lap", "Retired"
  gap_to_leader_ms  int,
  -- qualifying-specific
  q1_ms             int,
  q2_ms             int,
  q3_ms             int,
  -- race-specific
  grid              int,
  primary key (session_id, driver_id)
);

create index idx_vizf1_session_results_driver on vizf1_session_results (driver_id);

-- =====================================================
-- ARTICLES: RSS-ingested + Gemini-summarised F1 news
-- =====================================================

create table vizf1_articles (
  id                uuid primary key default gen_random_uuid(),
  url               text not null unique,
  url_hash          text not null unique,               -- sha256 of url
  publisher         text not null,
  headline          text not null,
  original_snippet  text,
  image_url         text,
  published_at      timestamptz not null,
  ingested_at       timestamptz not null default now(),
  -- summarisation
  summary           text,
  summary_model     text,
  summary_at        timestamptz,
  -- status: pending | summarized | hidden (not F1) | failed
  status            text not null default 'pending',
  failure_reason    text,
  topic_category    text                                -- on_track | off_track | transfer | regs | other
);

create index idx_vizf1_articles_published_at on vizf1_articles (published_at desc);
create index idx_vizf1_articles_status on vizf1_articles (status);

-- =====================================================
-- ARTICLE → ENTITY tagging (polymorphic)
-- =====================================================

create type vizf1_article_entity_type as enum ('driver', 'constructor', 'circuit');

create table vizf1_article_entities (
  article_id        uuid not null references vizf1_articles(id) on delete cascade,
  entity_type       vizf1_article_entity_type not null,
  entity_id         text not null,                      -- driver_id / constructor_id / circuit_id
  confidence        real not null default 1.0,
  primary key (article_id, entity_type, entity_id)
);

create index idx_vizf1_article_entities_entity on vizf1_article_entities (entity_type, entity_id);

-- =====================================================
-- STORY SEGMENTS: pre-computed rings → article order
-- Regenerated nightly so the front page doesn't fan out a heavy join.
-- =====================================================

create table vizf1_story_segments (
  id                uuid primary key default gen_random_uuid(),
  entity_type       vizf1_article_entity_type not null,
  entity_id         text not null,
  article_id        uuid not null references vizf1_articles(id) on delete cascade,
  rank              int not null,                       -- 0..4 within an entity
  created_at        timestamptz not null default now(),
  unique (entity_type, entity_id, article_id)
);

create index idx_vizf1_story_segments_entity on vizf1_story_segments (entity_type, entity_id, rank);

-- =====================================================
-- RLS — public read everywhere, service-role writes
-- (no user accounts yet; auth comes in a later pass).
-- =====================================================

alter table vizf1_drivers          enable row level security;
alter table vizf1_constructors     enable row level security;
alter table vizf1_circuits         enable row level security;
alter table vizf1_races            enable row level security;
alter table vizf1_sessions         enable row level security;
alter table vizf1_session_results  enable row level security;
alter table vizf1_articles         enable row level security;
alter table vizf1_article_entities enable row level security;
alter table vizf1_story_segments   enable row level security;

create policy "vizf1_drivers: public read"          on vizf1_drivers          for select using (true);
create policy "vizf1_constructors: public read"     on vizf1_constructors     for select using (true);
create policy "vizf1_circuits: public read"         on vizf1_circuits         for select using (true);
create policy "vizf1_races: public read"            on vizf1_races            for select using (true);
create policy "vizf1_sessions: public read"         on vizf1_sessions         for select using (true);
create policy "vizf1_session_results: public read"  on vizf1_session_results  for select using (true);
create policy "vizf1_articles: public read"         on vizf1_articles         for select using (status = 'summarized');
create policy "vizf1_article_entities: public read" on vizf1_article_entities for select using (true);
create policy "vizf1_story_segments: public read"   on vizf1_story_segments   for select using (true);
