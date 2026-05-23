-- Per-lap finishing order for race + sprint sessions.
--
-- OpenF1 gives us /position (sparse time-keyed events) + /laps (per-driver lap
-- start timestamps). We precompute "position at end of lap N for driver X" here
-- so the client can chart lap-by-lap progression with a single round-trip.
--
-- We only populate this for race + sprint — that's the only place a position-
-- by-lap chart makes sense.

create table vizf1_session_lap_positions (
  session_id  uuid not null references vizf1_sessions(id) on delete cascade,
  driver_id   text not null references vizf1_drivers(driver_id),
  lap         int  not null,
  position    int  not null,
  primary key (session_id, driver_id, lap)
);

create index idx_vizf1_session_lap_positions_session on vizf1_session_lap_positions (session_id);

alter table vizf1_session_lap_positions enable row level security;

create policy "vizf1_session_lap_positions: public read"
  on vizf1_session_lap_positions for select using (true);

notify pgrst, 'reload schema';
