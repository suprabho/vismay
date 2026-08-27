"""Latest-completed-session resolver — the piece that makes scheduled ingestion
safe.

The telemetry workflow was dispatch-only because a blind scheduled backfill
would re-load the whole season every run. This module closes that gap: it walks
the FastF1 event schedule for a season, keeps the sessions whose scheduled
start (plus a grace window for the session to run and FastF1's live-timing data
to publish) is in the past, and drops the ones Supabase already marks fully
ingested. What remains — newest first, capped — is exactly what a cron run
should ingest.

Re-ingesting a partially-ingested session is safe (every write is an idempotent
upsert), so "pending" here means anything short of fully done: missing rows,
failed phases, or a crashed run stuck in processing.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import fastf1
import pandas as pd

from .extract import make_session_key
from .supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)

# FastF1 schedule session name -> session-type abbreviation (the CLI/session_key
# vocabulary). Covers every name FastF1 emits for Session1..Session5.
SESSION_NAME_TO_TYPE = {
    "Practice 1":        "FP1",
    "Practice 2":        "FP2",
    "Practice 3":        "FP3",
    "Qualifying":        "Q",
    "Sprint":            "S",
    "Sprint Qualifying": "SQ",
    "Sprint Shootout":   "SS",
    "Race":              "R",
}

# Statuses that mean a phase needs no further work. A row whose phases are all
# settled is skipped; anything else (missing row, pending, processing, failed)
# is re-ingested — upserts make retries free.
_SETTLED_POSITIONS = ("done",)
_SETTLED_TELEMETRY = ("done", "skipped")


@dataclass(frozen=True)
class PendingSession:
    session_key: str
    year: int
    gp_name: str
    session_type: str
    round: int | None
    start_utc: pd.Timestamp


def _session_start_utc(ev, slot: int) -> pd.Timestamp | None:
    """Scheduled UTC start of schedule slot `slot` (1-5), or None."""
    val = ev.get(f"Session{slot}DateUtc")
    if val is not None and pd.notna(val):
        return pd.Timestamp(val)
    # Older schedules: tz-aware local Session{slot}Date -> naive UTC.
    val = ev.get(f"Session{slot}Date")
    if val is not None and pd.notna(val):
        ts = pd.Timestamp(val)
        if ts.tzinfo is not None:
            ts = ts.tz_convert("UTC").tz_localize(None)
        return ts
    return None


def _settled_keys(sink: SupabaseSink, year: int) -> set[str]:
    rows = sink.fetch_rows(
        "vizf1_telemetry_sessions",
        "session_key,positions_status,telemetry_status",
        {"season": year},
    )
    return {
        r["session_key"]
        for r in rows
        if r.get("positions_status") in _SETTLED_POSITIONS
        and r.get("telemetry_status") in _SETTLED_TELEMETRY
    }


def resolve_pending_sessions(
    sink: SupabaseSink,
    year: int,
    session_types: set[str],
    grace_hours: float,
    now_utc: pd.Timestamp | None = None,
) -> list[PendingSession]:
    """Sessions that have completed but aren't fully ingested, newest first.

    A session counts as completed once `start + grace_hours <= now`: the grace
    window has to cover the session itself (a race runs ~2h) plus FastF1's
    publication lag, so an over-eager run doesn't burn an attempt on data that
    doesn't exist yet. Sessions the scheduler picks up too early simply appear
    in the next run — the resolver keys off Supabase status, not off time.
    """
    now = now_utc if now_utc is not None else pd.Timestamp.now("UTC").tz_localize(None)
    cutoff = now - pd.Timedelta(hours=grace_hours)

    schedule = fastf1.get_event_schedule(year)
    settled = _settled_keys(sink, year)

    pending: list[PendingSession] = []
    for _, ev in schedule.iterrows():
        gp = str(ev.get("EventName", "")).strip()
        if not gp:
            continue
        rnd = ev.get("RoundNumber")
        try:
            rnd = int(rnd) if pd.notna(rnd) else None
        except (TypeError, ValueError):
            rnd = None
        # Round 0 is pre-season testing — no telemetry tables want it.
        if rnd == 0:
            continue

        for slot in range(1, 6):
            name = ev.get(f"Session{slot}")
            stype = SESSION_NAME_TO_TYPE.get(str(name).strip()) if isinstance(name, str) else None
            if stype is None or stype not in session_types:
                continue
            start = _session_start_utc(ev, slot)
            if start is None or start > cutoff:
                continue
            key = make_session_key(year, gp, stype)
            if key in settled:
                continue
            pending.append(PendingSession(
                session_key=key,
                year=year,
                gp_name=gp,
                session_type=stype,
                round=rnd,
                start_utc=start,
            ))

    # Newest first: the just-finished session is the one the replay page is
    # waiting on; older stragglers (e.g. a session that kept failing) follow
    # and can never starve it.
    pending.sort(key=lambda p: p.start_utc, reverse=True)
    return pending
