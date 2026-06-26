"""VizF1 telemetry ingestion CLI.

  python -m vizf1_ingest.cli ingest --year 2024 --gp "Monaco" --session R
  python -m vizf1_ingest.cli backfill-season --year 2024 --session R
  python -m vizf1_ingest.cli list-sessions --year 2024

Replaces the donor's FastAPI router + BackgroundTasks. All commands are
synchronous and idempotent.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys

import fastf1

from .config import load_settings
from .ingest import ingest_session, list_available_sessions
from .supabase_sink import SupabaseSink


def _setup(settings) -> SupabaseSink:
    os.makedirs(settings.fastf1_cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(settings.fastf1_cache_dir)
    return SupabaseSink(settings)


def _cmd_ingest(args, sink: SupabaseSink) -> int:
    key = ingest_session(sink, args.year, args.gp, args.session)
    print(f"ingested {key}")
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
