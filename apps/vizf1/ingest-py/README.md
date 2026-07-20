# vizf1 FastF1 telemetry ingestion

Loads F1 sessions via [FastF1](https://docs.fastf1.dev/) and upserts real
telemetry into the shared Supabase project (the `vizf1_telemetry_*` /
`vizf1_car_positions` / `vizf1_lap_telemetry` tables — see
`supabase/vizf1/migrations/004_telemetry.sql`).

This is a **standalone sibling app**, intentionally *not* a pnpm workspace
package: `pnpm install` / Turbo never touch it. It has its own Python toolchain.
It's the Supabase-native, slimmed-down successor to the donor `f1_backend/AI`
ingestion code (MongoDB → Supabase; FastAPI/Crew/LangGraph dropped).

## Setup

```bash
cd apps/vizf1/ingest-py
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase service-role creds
```

## Usage

```bash
# one session (Grand Prix name, FastF1 session abbreviation)
python -m vizf1_ingest.cli ingest --year 2024 --gp "Monaco" --session R

# auto: ingest completed-but-missing sessions for the current season
# (what the scheduled GitHub Action runs — see .github/workflows/vizf1-telemetry.yml)
python -m vizf1_ingest.cli ingest-latest
python -m vizf1_ingest.cli ingest-latest --dry-run   # resolve + print only

# every round's race in a season
python -m vizf1_ingest.cli backfill-season --year 2024 --session R

# inspect a season's schedule (no DB writes)
python -m vizf1_ingest.cli list-sessions --year 2024
```

`ingest-latest` diffs the FastF1 event schedule against the
`vizf1_telemetry_sessions` status columns and ingests sessions that have
completed (scheduled start + `--grace-hours`, default 4, in the past) but
aren't fully loaded — newest first, capped at `--max` (default 3) per run so a
scheduled run can never snowball into a full-season backfill. Partially
ingested or failed sessions count as missing and are retried (all writes are
idempotent upserts). `--sessions` picks the session types to watch (default
`R,Q,S,SQ,SS` — practice excluded).

`--session`: `R` (race), `Q` (qualifying), `S`/`SS`/`SQ` (sprint variants),
`FP1`/`FP2`/`FP3` (practice). Practice sessions skip the heavy
`vizf1_lap_telemetry` channel storage (positions + lap aggregates still load).

## What it writes

| Table | Grain | Notes |
| --- | --- | --- |
| `vizf1_telemetry_sessions` | 1/session | drivers, results, stints, weather, status |
| `vizf1_telemetry_circuits` | 1/(circuit, year) | corners + outline (+ optional `z` elevation) |
| `vizf1_telemetry_laps` | 1/(session, driver, lap) | processed lap + aggregate scalars |
| `vizf1_car_positions` | 1/(session, driver) | columnar X/Y/Z frames @ ~4 Hz |
| `vizf1_lap_telemetry` | 1/(session, driver, lap) | channel traces @ ~20 Hz (non-practice) |

All writes are idempotent upserts on the natural key, so re-running is a no-op.

## Notes

- Telemetry only exists **after a session has run** (FastF1's live-timing source).
- FastF1 downloads are slow + rate-limited; set `FASTF1_CACHE_DIR` and cache it
  in CI.

## When the scheduled run goes red

`SessionNotAvailableError: No data for this session!` on a session that
definitely ran — with `Falling back to livetiming mirror` lines in the log —
means the GitHub runner drew a Cloudflare-blocked IP: `livetiming.formula1.com`
rejects most datacenter IPs (per-runner lottery), and FastF1's mirror fallback
(`livetiming-mirror.fastf1.dev`) has been observed empty (404s for every
session). The red run is by design (`ingest-latest` exits non-zero so nothing
is silently dropped) and each later scheduled run retries for free — but only a
runner that slips through the block can succeed.

When a session needs to land *now* (e.g. the race replay is waiting on it), run
the ingest locally — residential IPs reach the primary source fine:

```bash
cd apps/vizf1/ingest-py
ln -sf ../worker/.env .env   # or fill .env per .env.example
.venv/bin/python -m vizf1_ingest.cli ingest-latest
```

The next scheduled run then resolves to "nothing to ingest" and goes green.
