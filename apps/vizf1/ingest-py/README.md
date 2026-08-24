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

`--source` (all ingest commands): `auto` (default) tries FastF1 and falls back
to OpenF1 when FastF1 has no session data; `fastf1` / `openf1` force one path.
See "The OpenF1 fallback" below for what the fallback does and doesn't provide.

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

### Write pacing (`VIZF1_INGEST_WRITE_BPS`)

Supabase is **one shared instance serving every prod vertical**, on a disk-IO
burst budget. A race positions phase pushes ~15-20 MB of TOASTed JSONB (one
~0.5-1 MB blob per driver); sent flat out it drains that budget and wedges the
whole instance — REST, Storage and even Supabase's own mgmt-api stop answering,
for ~20 min plus ~1 h of degraded blob writes. This happened on 2026-07-20 and
again on 2026-08-24.

`SupabaseSink` therefore caps both **request size** (1.5 MB / 100 rows) and
**sustained throughput** (`VIZF1_INGEST_WRITE_BPS`, default 1 MB/s — set `0` to
disable). Each `upsert` logs its MB and paced seconds.

It also has a **latching circuit breaker**: after 2 consecutive failed write
requests it raises `SinkUnavailable` and refuses everything after that, so a run
aborts instead of hammering a degraded instance. Note a successful *status*
write does not reset that counter — during a wedge small writes keep passing
while blob writes time out.

**If a run aborts with `SinkUnavailable`: stop. Do not re-run immediately.**
Blob writes keep failing for ~1 h after the instance looks recovered; retrying
re-wedges it and extends the outage. Watch `rest/v1` with a 60 s curl probe and
check the Disk IO budget graph before trying again.

## The OpenF1 fallback

`livetiming.formula1.com` sits behind Cloudflare and rejects most datacenter
IPs (per-runner lottery on GitHub), and FastF1's mirror fallback
(`livetiming-mirror.fastf1.dev`) has been observed empty for whole race
weekends. With `--source auto` (the default, and what the scheduled workflow
runs), a session FastF1 can't load is re-ingested from
[OpenF1](https://openf1.org) instead (`vizf1_ingest/openf1_client.py` +
`openf1_ingest.py`) — free historical REST API, no auth, not behind the F1
Cloudflare wall.

What differs from a FastF1 ingest:

- channel traces and position frames land at OpenF1's native **~4 Hz** (vs
  20 Hz channels) — `sample_rate_hz` on each row records it, and
  `vizf1_telemetry_sessions.data_source` is `'openf1'` (migration 006);
- `distance` is integrated from speed (not FastF1's odometer channel), and
  `avg/min_gap_to_ahead_m` are **null** (OpenF1 has no per-meter gap data);
- circuit rows get an outline but **no corners / rotation**, so one is written
  only when no `(circuit_key, year)` row exists yet — a FastF1 row is never
  overwritten. Re-ingesting the session later with `--source fastf1` upgrades
  everything in place (idempotent upserts).

`gp_name` / `session_key` always come from the FastF1 event schedule (which is
not Cloudflare-walled); the OpenF1 session is matched by session type + start
time, never by meeting name. Requests are spaced ~2.1s (free tier allows
30/min), so a full race session takes ~8-10 minutes to fall back.

## When the scheduled run goes red

Both sources failing usually means the session is simply too recent — OpenF1
publishes shortly after a session ends; laps appearing but `car_data` erroring
marks `telemetry_status='failed'` and is retried next run. The red run is by
design (`ingest-latest` exits non-zero so nothing is silently dropped) and
each later scheduled run retries for free.

When a session needs to land *now* (e.g. the race replay is waiting on it), or
you want full-resolution FastF1 data instead of the 4 Hz fallback, run the
ingest locally — residential IPs reach the primary source fine:

```bash
cd apps/vizf1/ingest-py
ln -sf ../worker/.env .env   # or fill .env per .env.example
.venv/bin/python -m vizf1_ingest.cli ingest-latest
```

The next scheduled run then resolves to "nothing to ingest" and goes green.
