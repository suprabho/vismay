-- VizF1 schema v1
-- Mirrors apps/footshort/supabase/migrations/20260420000000_init.sql in spirit,
-- but F1's entities have such different shapes (drivers have portraits, teams
-- have constructor colors, circuits have geometry) that one polymorphic table
-- would be a leaky abstraction. Each entity gets its own table, and
-- article_entities polymorphically references them by (entity_type, entity_id).

-- =====================================================
-- DRIVERS
-- =====================================================

create table drivers (
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
  primary_color     text,                               -- hex, mirrors constructors.primary_color
  updated_at        timestamptz not null default now()
);

create index idx_drivers_constructor on drivers (constructor_id);

-- =====================================================
-- CONSTRUCTORS
-- =====================================================

create table constructors (
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

create table circuits (
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

create table races (
  id                uuid primary key default gen_random_uuid(),
  season            text not null,                      -- "2026"
  round             int not null,                       -- 1..24
  race_name         text not null,
  circuit_id        text references circuits(circuit_id),
  date              date not null,                      -- race day
  time              text,                               -- "13:00:00Z" or null
  has_sprint        boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique (season, round)
);

create index idx_races_date on races (date);

-- =====================================================
-- SESSIONS: FP1, FP2, FP3, Qualifying, Sprint Q, Sprint, Race
-- =====================================================

create type session_type as enum ('fp1', 'fp2', 'fp3', 'quali', 'sprint_quali', 'sprint', 'race');

create table sessions (
  id                  uuid primary key default gen_random_uuid(),
  race_id             uuid not null references races(id) on delete cascade,
  session_type        session_type not null,
  -- OpenF1 keys for cross-referencing
  session_key_openf1  int,                              -- /sessions session_key
  started_at          timestamptz,
  status              text not null default 'pending',  -- pending | live | finished
  updated_at          timestamptz not null default now(),
  unique (race_id, session_type)
);

create index idx_sessions_race on sessions (race_id);
create index idx_sessions_type on sessions (session_type);

-- =====================================================
-- SESSION RESULTS: per-driver row per session
-- Race + sprint use position + points; practice uses best_lap_ms.
-- =====================================================

create table session_results (
  session_id        uuid not null references sessions(id) on delete cascade,
  driver_id         text not null references drivers(driver_id),
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

create index idx_session_results_driver on session_results (driver_id);

-- =====================================================
-- ARTICLES: RSS-ingested + Gemini-summarised F1 news
-- =====================================================

create table articles (
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

create index idx_articles_published_at on articles (published_at desc);
create index idx_articles_status on articles (status);

-- =====================================================
-- ARTICLE → ENTITY tagging (polymorphic)
-- =====================================================

create type article_entity_type as enum ('driver', 'constructor', 'circuit');

create table article_entities (
  article_id        uuid not null references articles(id) on delete cascade,
  entity_type       article_entity_type not null,
  entity_id         text not null,                      -- driver_id / constructor_id / circuit_id
  confidence        real not null default 1.0,
  primary key (article_id, entity_type, entity_id)
);

create index idx_article_entities_entity on article_entities (entity_type, entity_id);

-- =====================================================
-- STORY SEGMENTS: pre-computed rings → article order
-- Regenerated nightly so the front page doesn't fan out a heavy join.
-- =====================================================

create table story_segments (
  id                uuid primary key default gen_random_uuid(),
  entity_type       article_entity_type not null,
  entity_id         text not null,
  article_id        uuid not null references articles(id) on delete cascade,
  rank              int not null,                       -- 0..4 within an entity
  created_at        timestamptz not null default now(),
  unique (entity_type, entity_id, article_id)
);

create index idx_story_segments_entity on story_segments (entity_type, entity_id, rank);

-- =====================================================
-- RLS — public read everywhere, service-role writes
-- (no user accounts yet; auth comes in a later pass).
-- =====================================================

alter table drivers          enable row level security;
alter table constructors     enable row level security;
alter table circuits         enable row level security;
alter table races            enable row level security;
alter table sessions         enable row level security;
alter table session_results  enable row level security;
alter table articles         enable row level security;
alter table article_entities enable row level security;
alter table story_segments   enable row level security;

create policy "drivers: public read"          on drivers          for select using (true);
create policy "constructors: public read"     on constructors     for select using (true);
create policy "circuits: public read"         on circuits         for select using (true);
create policy "races: public read"            on races            for select using (true);
create policy "sessions: public read"         on sessions         for select using (true);
create policy "session_results: public read"  on session_results  for select using (true);
create policy "articles: public read"         on articles         for select using (status = 'summarized');
create policy "article_entities: public read" on article_entities for select using (true);
create policy "story_segments: public read"   on story_segments   for select using (true);
