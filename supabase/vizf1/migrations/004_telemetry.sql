-- VizF1 telemetry v1 — FastF1 per-sample telemetry for race replay, the
-- telemetry-clip player, the 3D track view, and telemetry-grounded stories.
--
-- Source of truth is the FastF1 ingestion worker (apps/vizf1/ingest-py). These
-- tables mirror the donor's Mongo collections (telemetry_sessions, circuits,
-- car_positions, raw_lap_telemetry) but as columnar JSONB rather than
-- row-per-sample: at 4-20 Hz x ~60 laps x 20 drivers row-per-sample is tens of
-- millions of rows per session — unworkable in Postgres/PostgREST. Per-driver /
-- per-driver-lap JSONB blobs keep it to ~20 rows (positions) + ~1,200 rows
-- (laps) per session; Postgres TOAST transparently compresses the blobs.
--
-- Self-contained on driver_number (int): FastF1 keys by car number, whereas the
-- existing vizf1_drivers/vizf1_session_* tables key by the jolpica driver_id
-- slug. We avoid coupling to the slug pipeline — every display field the replay
-- needs (teamColour, abbreviation, fullName) rides in the `drivers` JSONB. An
-- optional session_id FK to vizf1_sessions enables round-based navigation.
--
-- ADDITIVE + IDEMPOTENT: vizf1 has no supabase config.toml (see supabase/README
-- .md), so this migration is hand-applied via the dashboard / direct connection
-- and may be re-run. Every statement is guarded (create ... if not exists,
-- drop policy if exists) so re-application is a no-op.

-- =====================================================
-- TELEMETRY SESSIONS — 1 row per ingested session
-- session_key is the FastF1-style id "<year>_<gp_slug>_<R|Q|FP1|...>"
-- (matches _make_session_key in the donor ingest.py).
-- =====================================================

create table if not exists vizf1_telemetry_sessions (
  session_key       text primary key,                  -- "2024_monaco_R"
  session_id        uuid references vizf1_sessions(id) on delete set null,
  season            int  not null,                      -- year, e.g. 2024
  round             int,                                -- round within season (nullable)
  session_type      text not null,                      -- R | Q | S | SS | SQ | FP1..FP3
  session_name      text,
  gp_name           text,
  circuit_key       text not null,                      -- slug(gp_name)
  circuit_name      text,
  country           text,
  date_start        timestamptz,
  -- RaceDriver[] roster (driverNumber, fullName, abbreviation, teamName,
  -- teamId, teamColour, championship*). The replay session.drivers comes
  -- straight from here.
  drivers           jsonb not null default '[]'::jsonb,
  session_results   jsonb not null default '[]'::jsonb, -- per-driver grid/finish/points/Q times
  stints            jsonb not null default '[]'::jsonb, -- structured stint + pit + deg records
  weather_data      jsonb not null default '[]'::jsonb, -- per-lap weather sample
  -- ingestion phase status: pending | processing | done | failed
  positions_status  text not null default 'pending',
  positions_error   text,
  telemetry_status  text not null default 'pending',
  telemetry_error   text,
  ingested_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_vizf1_tel_sessions_season_round
  on vizf1_telemetry_sessions (season, round, session_type);
create index if not exists idx_vizf1_tel_sessions_circuit
  on vizf1_telemetry_sessions (circuit_key, season);

-- =====================================================
-- TELEMETRY CIRCUITS — 1 row per (circuit, year)
-- Geometry derived from the fastest lap's position data. outline.z is optional
-- (drives the 3D ribbon); absent it the track renders flat.
-- =====================================================

create table if not exists vizf1_telemetry_circuits (
  circuit_key        text not null,
  year               int  not null,
  gp_name            text,
  circuit_name       text,
  country            text,
  rotation_deg       double precision not null default 0,
  corners            jsonb not null default '[]'::jsonb,  -- {number,letter,x,y,angle,distance}[]
  outline            jsonb not null default '{}'::jsonb,  -- {x:[],y:[],z?:[]}  (track meters)
  bounds             jsonb,                                -- {minX,maxX,minY,maxY}
  sector_boundaries  jsonb,                                -- {index1,index2} into outline
  updated_at         timestamptz not null default now(),
  primary key (circuit_key, year)
);

-- =====================================================
-- TELEMETRY LAPS — 1 row per (session, driver, lap)
-- Processed-lap fields + the per-lap aggregate scalars computed by
-- _aggregate_from_arrays in the donor. Feeds the replay aggregates Map, the
-- telemetry charts, and signal detection.
-- =====================================================

create table if not exists vizf1_telemetry_laps (
  session_key        text not null references vizf1_telemetry_sessions(session_key) on delete cascade,
  driver_number      int  not null,
  lap                int  not null,
  -- processed lap
  lap_time_sec       double precision,
  sectors            jsonb not null default '[]'::jsonb,  -- [s1,s2,s3] (nullable elems)
  compound           text,
  stint_lap          int,
  tyre_life          int,
  fresh_tyre         boolean,
  position           int,
  events             jsonb not null default '[]'::jsonb,  -- ["pit_in","sc_deployed","personal_best",...]
  -- aggregates
  avg_speed          double precision,
  max_speed          double precision,
  avg_throttle_pct   double precision,
  braking_events     int,
  drs_activations    int,
  top_gear           int,
  lap_distance_m     double precision,
  sector1_max_speed  double precision,
  sector2_max_speed  double precision,
  sector3_max_speed  double precision,
  avg_gap_to_ahead_m double precision,
  min_gap_to_ahead_m double precision,
  max_rpm            int,
  avg_rpm            int,
  elevation_gain_m   double precision,
  primary key (session_key, driver_number, lap)
);

create index if not exists idx_vizf1_tel_laps_session
  on vizf1_telemetry_laps (session_key);

-- =====================================================
-- CAR POSITIONS — 1 row per (session, driver), downsampled to ~4-8 Hz
-- Columnar frames drive the replay dots + 2D/3D track. Lap-window filtering at
-- read time strides over `frames`.
-- =====================================================

create table if not exists vizf1_car_positions (
  session_key      text not null references vizf1_telemetry_sessions(session_key) on delete cascade,
  driver_number    int  not null,
  circuit_key      text,
  sample_rate_hz   int  not null default 4,
  frame_count      int  not null default 0,
  t0_ms            int  not null default 0,
  t_end_ms         int  not null default 0,
  -- {t:[],x:[],y:[],z?:[],lap:[],status:[]} — all arrays same length
  frames           jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  primary key (session_key, driver_number)
);

create index if not exists idx_vizf1_car_positions_session
  on vizf1_car_positions (session_key);

-- =====================================================
-- LAP TELEMETRY — 1 row per (session, driver, lap), downsampled to ~20 Hz
-- The heavy table: raw channel traces (speed/throttle/brake/drs/gear/rpm) for
-- the telemetry-clip dashboard. ONLY populated for R/Q/Sprint (skip practice)
-- to cap storage. The clip route strides these further to a requested hz.
-- =====================================================

create table if not exists vizf1_lap_telemetry (
  session_key      text not null references vizf1_telemetry_sessions(session_key) on delete cascade,
  driver_number    int  not null,
  lap              int  not null,
  sample_rate_hz   int  not null default 20,
  frame_count      int  not null default 0,
  -- {sessionTime:[],distance:[],speed:[],throttle:[],brake:[],drs:[],nGear:[],rpm:[]}
  channels         jsonb not null default '{}'::jsonb,
  primary key (session_key, driver_number, lap)
);

create index if not exists idx_vizf1_lap_telemetry_session
  on vizf1_lap_telemetry (session_key);

-- =====================================================
-- RLS — public read, service-role writes (mirrors the existing vizf1 pattern).
-- Idempotent: enable is safe to re-run; policies are dropped before create.
-- =====================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'vizf1_telemetry_sessions',
    'vizf1_telemetry_circuits',
    'vizf1_telemetry_laps',
    'vizf1_car_positions',
    'vizf1_lap_telemetry'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: public read" on %I', t, t);
    execute format('create policy "%s: public read" on %I for select using (true)', t, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
