"""Session ingestion orchestrator.

One synchronous pass per session (the donor split Phase 1/2/3 across FastAPI
BackgroundTasks for HTTP retries; a CLI run does all phases then exits). Every
write is an idempotent upsert on the natural key, so re-running is a no-op.
"""
from __future__ import annotations

import logging

import fastf1
import pandas as pd
from fastf1.exceptions import DataNotLoadedError

from . import extract, positions, telemetry
from .supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)


class SessionDataUnavailable(RuntimeError):
    """FastF1 has no timing data for a requested session.

    `Session.load()` logs-and-continues when its live-timing source returns
    nothing — the session hasn't run yet, or FastF1 hasn't published its data —
    leaving the laps frame unpopulated. Accessing `session.laps` then raises a
    bare `DataNotLoadedError` from deep inside FastF1. We convert that into this
    typed, actionable error so the CLI reports it cleanly (no scary traceback)
    and the batch resolver can log-and-continue: data that's merely late will be
    there on the next scheduled run, which retries for free.
    """


class IngestPhaseFailure(RuntimeError):
    """One or more phases of an otherwise-completed ingest failed.

    Phases 2/3 catch their own exceptions so a failed phase never blocks the
    remaining ones (their statuses land in Supabase and the resolver retries
    them next run). But swallowing them entirely made `ingest-latest` print
    `ok` and exit 0 on a half-ingested session — a scheduled run stayed green
    while telemetry silently deferred. Raised at the END of ingest_session so
    all phases still get their attempt AND the caller sees the failure.
    """

# Aggregate dict key -> vizf1_telemetry_laps column.
_AGG_COLS = {
    "avgSpeed": "avg_speed",
    "maxSpeed": "max_speed",
    "avgThrottlePct": "avg_throttle_pct",
    "brakingEvents": "braking_events",
    "drsActivations": "drs_activations",
    "topGear": "top_gear",
    "lapDistanceM": "lap_distance_m",
    "sector1MaxSpeed": "sector1_max_speed",
    "sector2MaxSpeed": "sector2_max_speed",
    "sector3MaxSpeed": "sector3_max_speed",
    "avgGapToAheadM": "avg_gap_to_ahead_m",
    "minGapToAheadM": "min_gap_to_ahead_m",
    "maxRpm": "max_rpm",
    "avgRpm": "avg_rpm",
    "elevationGainM": "elevation_gain_m",
}


def _event_round(session) -> int | None:
    try:
        rn = session.event.get("RoundNumber")
        return int(rn) if pd.notna(rn) else None
    except Exception:
        return None


def _session_date_iso(session) -> str | None:
    for getter in (lambda: getattr(session, "date", None), lambda: session.event.get("EventDate")):
        try:
            val = getter()
        except Exception:
            val = None
        if val is not None and pd.notna(val):
            try:
                return pd.Timestamp(val).isoformat()
            except Exception:
                return None
    return None


def _mark_status(sink: SupabaseSink, session_key: str, values: dict) -> None:
    """Best-effort status patch. Status fields are advisory, so a failed write
    must never mask the real error (or crash an otherwise-successful ingest) —
    e.g. when Supabase is timing out, the failure handler's own update would
    raise and bury the original exception."""
    try:
        sink.update("vizf1_telemetry_sessions", {"session_key": session_key}, values)
    except Exception as exc:  # noqa: BLE001
        logger.warning("status update %s failed: %s", values, exc)


def _build_lap_rows(session_key: str, processed_laps: list[dict], aggregates: dict) -> list[dict]:
    rows: list[dict] = []
    # Union of (driver, lap) keys across processed laps + aggregates.
    keys = {(p["driverNumber"], p["lap"]) for p in processed_laps}
    keys |= set(aggregates.keys())
    by_key = {(p["driverNumber"], p["lap"]): p for p in processed_laps}

    for dn, lap in sorted(keys):
        p = by_key.get((dn, lap), {})
        row: dict = {
            "session_key":   session_key,
            "driver_number": dn,
            "lap":           lap,
            "lap_time_sec":  p.get("lapTimeSec"),
            "sectors":       p.get("sectors", []),
            "compound":      p.get("compound"),
            "stint_lap":     p.get("stintLap"),
            "tyre_life":     p.get("tyreLife"),
            "fresh_tyre":    p.get("freshTyre"),
            "position":      p.get("position"),
            "events":        p.get("events", []),
        }
        agg = aggregates.get((dn, lap))
        if agg:
            for src, col in _AGG_COLS.items():
                row[col] = agg.get(src)
        rows.append(row)
    return rows


def _canonical_gp_name(session, fallback: str) -> str:
    """The official Grand Prix name from FastF1's event metadata.

    Operators dispatch the ingest with whatever FastF1 accepts as a GP arg —
    "Bahrain", "Sakhir", "Jeddah", a round number — but the web links telemetry
    to the OpenF1 schedule by GP NAME (apps/vizf1/web/lib/useTelemetrySession),
    so the stored name MUST be the official one ("Bahrain Grand Prix"). Deriving
    it from the loaded session rather than trusting the CLI arg is what keeps a
    short-name ingest from silently producing a session that no schedule row can
    find. Falls back to the supplied arg if FastF1 omits the field.
    """
    try:
        name = session.event.get("EventName")
    except Exception:
        name = None
    if name is not None and pd.notna(name):
        text = str(name).strip()
        if text:
            return text
    return fallback


def ingest_session(sink: SupabaseSink, year: int, gp_name: str, session_type: str) -> str:
    """Load + normalize + upsert one session. Returns the session_key."""
    logger.info("Loading FastF1 session: %s %s %s", year, gp_name, session_type)

    session = fastf1.get_session(year, gp_name, session_type)
    # Load everything once — telemetry=True pulls car_data + pos_data.
    session.load(laps=True, telemetry=True, weather=True, messages=True)
    try:
        laps_df = session.laps
    except DataNotLoadedError as exc:
        # load() above logs-and-continues when FastF1's live-timing source has
        # no data for the session, leaving _laps unset — accessing it here then
        # raises DataNotLoadedError. There is nothing to ingest; surface it as a
        # clear, retryable error instead of a bare traceback (see
        # SessionDataUnavailable).
        raise SessionDataUnavailable(
            f"No timing data available for {year} {gp_name} {session_type} — the "
            "session may not have run yet, or FastF1 hasn't published its "
            "live-timing data. Try again once the session has completed."
        ) from exc

    # Canonicalize the GP name from the loaded event so session_key, circuit_key
    # and gp_name are stable no matter how the session was requested (see
    # _canonical_gp_name) — and so gp_name matches the schedule's race_name.
    gp_name = _canonical_gp_name(session, gp_name)
    session_key = extract.make_session_key(year, gp_name, session_type)
    ckey = extract.circuit_key(gp_name)
    logger.info("Resolved session_key: %s (gp_name=%r)", session_key, gp_name)

    # ── Phase 1: session metadata, drivers, results, processed laps ──────────
    standings = extract.fetch_championship_standings(year)
    drivers = extract.extract_drivers(session, standings)
    session_results = extract.extract_session_results(session)
    weather_data = extract.extract_weather(session, laps_df)
    stints = extract.extract_stints(laps_df)
    processed_laps = extract.build_processed_laps(session, laps_df)

    session_row = {
        "session_key":      session_key,
        "season":           year,
        "round":            _event_round(session),
        "session_type":     session_type,
        "session_name":     str(getattr(session, "name", "") or ""),
        "gp_name":          gp_name,
        "circuit_key":      ckey,
        "circuit_name":     str(session.event.get("Location", "")),
        "country":          str(session.event.get("Country", "")),
        "date_start":       _session_date_iso(session),
        "drivers":          drivers,
        "session_results":  session_results,
        "stints":           stints,
        "weather_data":     weather_data,
        "positions_status": "pending",
        "telemetry_status": "pending",
    }
    sink.upsert("vizf1_telemetry_sessions", [session_row], on_conflict="session_key")

    # ── Phase 2: lap telemetry channels + aggregates (skip practice channels) ─
    is_practice = session_type.upper().startswith("FP")
    aggregates: dict = {}
    phase_errors: list[str] = []
    if is_practice:
        logger.info("Practice session — skipping lap-telemetry channel storage")
        _mark_status(sink, session_key, {"telemetry_status": "skipped"})
    else:
        try:
            channel_rows, aggregates = telemetry.extract_lap_telemetry(session, session_key)
            sink.upsert("vizf1_lap_telemetry", channel_rows,
                        on_conflict="session_key,driver_number,lap")
            _mark_status(sink, session_key, {"telemetry_status": "done", "telemetry_error": None})
        except Exception as exc:  # noqa: BLE001
            logger.error("Phase 2 failed for %s: %s", session_key, exc)
            _mark_status(sink, session_key, {"telemetry_status": "failed", "telemetry_error": str(exc)[:2000]})
            phase_errors.append(f"phase 2 (lap telemetry): {exc}")

    # ── Merge processed laps + aggregates -> vizf1_telemetry_laps ────────────
    lap_rows = _build_lap_rows(session_key, processed_laps, aggregates)
    sink.upsert("vizf1_telemetry_laps", lap_rows, on_conflict="session_key,driver_number,lap")

    # ── Phase 3: circuit geometry + car positions ───────────────────────────
    try:
        circuit_row = positions.build_circuit_row(session, year, gp_name)
        sink.upsert("vizf1_telemetry_circuits", [circuit_row], on_conflict="circuit_key,year")
        position_rows = positions.build_position_rows(session, session_key, ckey)
        # One driver per request: each row carries a full-race position blob
        # (~0.5-1 MB), so batching multiple drivers overruns the PostgREST
        # request budget and trips a Cloudflare 522 on race-length sessions.
        sink.upsert("vizf1_car_positions", position_rows,
                    on_conflict="session_key,driver_number", chunk=1)
        _mark_status(sink, session_key, {"positions_status": "done", "positions_error": None})
        logger.info("Positions done for %s: %d drivers", session_key, len(position_rows))
    except Exception as exc:  # noqa: BLE001
        logger.error("Phase 3 failed for %s: %s", session_key, exc)
        _mark_status(sink, session_key, {"positions_status": "failed", "positions_error": str(exc)[:2000]})
        phase_errors.append(f"phase 3 (positions): {exc}")

    if phase_errors:
        raise IngestPhaseFailure(f"{session_key}: " + "; ".join(phase_errors))
    logger.info("Ingest complete: %s", session_key)
    return session_key


def list_available_sessions(year: int) -> list[dict]:
    """List sessions in a year's schedule (port of the donor's available route)."""
    schedule = fastf1.get_event_schedule(year)
    out: list[dict] = []
    for _, ev in schedule.iterrows():
        gp = str(ev.get("EventName", ""))
        rnd = ev.get("RoundNumber")
        sessions: list[str] = []
        for i in range(1, 6):
            name = ev.get(f"Session{i}")
            if isinstance(name, str) and name:
                sessions.append(name)
        out.append({
            "round": int(rnd) if pd.notna(rnd) else None,
            "eventName": gp,
            "country": str(ev.get("Country", "")),
            "location": str(ev.get("Location", "")),
            "sessions": sessions,
        })
    return out
