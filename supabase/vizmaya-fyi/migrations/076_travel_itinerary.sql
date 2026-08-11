-- Travel: store the trip itinerary alongside the gate row so surfaces without
-- the travel app's filesystem (admin compose/canvas, the shared render
-- surface's canvas frames) can read stops/coordinates. The travel app itself
-- keeps `<slug>.trip.yaml` as the generated source of truth; this column is a
-- synced mirror (scripts/travel/sync-trip-db.ts, and travel:import upserts it
-- when Supabase env is present).
--
-- Shape: the parsed TripData (days/stops/stays/airports) WITHOUT per-stop
-- media arrays — media joins from travel_trip_media at read time. Small
-- payload (tens of KB), no wedge risk.
--
-- Apply by hand in the Supabase SQL editor (no CI applies migrations).

alter table travel_trips add column if not exists itinerary jsonb;
