"""VizF1 telemetry ingestion CLI.

  python -m vizf1_ingest.cli ingest --year 2024 --gp "Monaco" --session R
  python -m vizf1_ingest.cli ingest-latest
  python -m vizf1_ingest.cli backfill-season --year 2024 --session R
  python -m vizf1_ingest.cli list-sessions --year 2024

Replaces the donor's FastAPI router + BackgroundTasks. All commands are
synchronous and idempotent.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import sys

import fastf1

from .config import load_settings
from .ingest import IngestPhaseFailure, SessionDataUnavailable, ingest_session, list_available_sessions
from .latest import resolve_pending_sessions
from .supabase_sink import SupabaseSink


def _setup(settings) -> SupabaseSink:
    os.makedirs(settings.fastf1_cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(settings.fastf1_cache_dir)
    return SupabaseSink(settings)


def _cmd_ingest(args, sink: SupabaseSink) -> int:
    try:
        key = ingest_session(sink, args.year, args.gp, args.session)
    except SessionDataUnavailable as exc:
        # A requested session whose data isn't published yet is an expected,
        # retryable condition — report it cleanly (no traceback) but still exit
        # non-zero so the operator/CI sees the request produced no data.
        print(f"no data ingested: {exc}", file=sys.stderr)
        return 1
    except IngestPhaseFailure as exc:
        # Partial ingest: statuses are recorded in Supabase and the next
        # ingest-latest run retries the failed phases (idempotent upserts) —
        # but THIS run must not pretend it fully succeeded.
        print(f"partial ingest: {exc}", file=sys.stderr)
        return 1
    print(f"ingested {key}")
    return 0


def _cmd_ingest_latest(args, sink: SupabaseSink) -> int:
    """Ingest whatever has completed but isn't fully loaded yet (cron entry point).

    Resolves pending sessions from the schedule + Supabase status, newest first,
    and ingests up to --max of them. Exits non-zero if any attempt failed so a
    scheduled run goes red instead of silently dropping a session — the next
    run retries it for free (idempotent upserts).
    """
    year = args.year or dt.datetime.now(dt.timezone.utc).year
    types = {t.strip().upper() for t in args.sessions.split(",") if t.strip()}
    pending = resolve_pending_sessions(sink, year, types, args.grace_hours)

    if not pending:
        print(f"nothing to ingest: season {year} is up to date for {sorted(types)}")
        return 0

    todo = pending[: args.max]
    skipped = len(pending) - len(todo)
    print(f"{len(pending)} pending session(s); ingesting {len(todo)}"
          + (f" (deferring {skipped} to later runs)" if skipped else ""))
    for p in todo:
        print(f"  - {p.session_key} (started {p.start_utc.isoformat()}Z)")
    if args.dry_run:
        print("dry run — no writes")
        return 0

    failures: list[str] = []
    for p in todo:
        try:
            key = ingest_session(sink, p.year, p.gp_name, p.session_type)
            print(f"  ok {key}")
        except Exception as exc:  # noqa: BLE001 — one bad session must not abort the batch
            logging.error("ingest-latest: %s failed: %s", p.session_key, exc)
            failures.append(p.session_key)
    if failures:
        print(f"completed with {len(failures)} failure(s): {', '.join(failures)}", file=sys.stderr)
        return 1
    return 0


def _cmd_backfill_season(args, sink: SupabaseSink) -> int:
    schedule = fastf1.get_event_schedule(args.year)
    failures: list[str] = []
    for _, ev in schedule.iterrows():
        gp = str(ev.get("EventName", "")).strip()
        rnd = ev.get("RoundNumber")
        # Round 0 in modern schedules is pre-season testing — skip.
        try:
            if rnd is not None and int(rnd) == 0:
                continue
        except (TypeError, ValueError):
            pass
        if not gp:
            continue
        try:
            key = ingest_session(sink, args.year, gp, args.session)
            print(f"  ok {key}")
        except Exception as exc:  # noqa: BLE001 — one bad event must not abort the season
            logging.warning("backfill: %s %s failed: %s", gp, args.session, exc)
            failures.append(f"{gp}:{args.session}")
    if failures:
        print(f"completed with {len(failures)} failures: {', '.join(failures)}", file=sys.stderr)
    return 0


def _cmd_list_sessions(args, _sink: SupabaseSink) -> int:
    print(json.dumps(list_available_sessions(args.year), indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(prog="vizf1-ingest", description="FastF1 -> Supabase telemetry ingestion")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ingest = sub.add_parser("ingest", help="ingest one session")
    p_ingest.add_argument("--year", type=int, required=True)
    p_ingest.add_argument("--gp", type=str, required=True, help='Grand Prix name, e.g. "Monaco"')
    p_ingest.add_argument("--session", type=str, required=True, help="R | Q | S | SS | SQ | FP1..FP3")
    p_ingest.set_defaults(func=_cmd_ingest)

    p_latest = sub.add_parser(
        "ingest-latest",
        help="ingest completed-but-missing sessions for a season (scheduled/cron entry point)",
    )
    p_latest.add_argument("--year", type=int, default=None, help="season (default: current UTC year)")
    p_latest.add_argument(
        "--sessions", type=str, default="R,Q,S,SQ,SS",
        help="comma-separated session types to auto-ingest (default R,Q,S,SQ,SS — practice excluded)",
    )
    p_latest.add_argument(
        "--grace-hours", type=float, default=4.0,
        help="hours after scheduled start before a session counts as completed "
             "(covers the session running + FastF1 publication lag; default 4)",
    )
    p_latest.add_argument("--max", type=int, default=3, help="max sessions to ingest per run (default 3)")
    p_latest.add_argument("--dry-run", action="store_true", help="resolve and print, no writes")
    p_latest.set_defaults(func=_cmd_ingest_latest)

    p_back = sub.add_parser("backfill-season", help="ingest one session type for every round in a season")
    p_back.add_argument("--year", type=int, required=True)
    p_back.add_argument("--session", type=str, default="R", help="session type to ingest per round (default R)")
    p_back.set_defaults(func=_cmd_backfill_season)

    p_list = sub.add_parser("list-sessions", help="print a season's schedule")
    p_list.add_argument("--year", type=int, required=True)
    p_list.set_defaults(func=_cmd_list_sessions)

    args = parser.parse_args(argv)
    settings = load_settings()
    sink = _setup(settings)
    return args.func(args, sink)


if __name__ == "__main__":
    raise SystemExit(main())
