-- Telemetry provenance: which upstream produced a session's telemetry rows.
--   'fastf1' — livetiming.formula1.com via FastF1 (20 Hz channels, corners)
--   'openf1' — api.openf1.org fallback (~4 Hz channels, no corner metadata),
--              used when CI runners draw a Cloudflare-blocked IP for the
--              FastF1 source (see apps/vizf1/ingest-py/README.md)
-- NULL = ingested before this column existed (always FastF1).
--
-- MUST be applied before deploying ingest code that writes data_source —
-- PostgREST rejects upsert payloads containing unknown columns.
-- Additive + idempotent; safe to re-run.
alter table vizf1_telemetry_sessions
  add column if not exists data_source text;

notify pgrst, 'reload schema';
