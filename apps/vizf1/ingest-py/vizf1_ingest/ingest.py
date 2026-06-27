"""Session ingestion orchestrator.

One synchronous pass per session (the donor split Phase 1/2/3 across FastAPI
BackgroundTasks for HTTP retries; a CLI run does all phases then exits). Every
write is an idempotent upsert on the natural key, so re-running is a no-op.
"""
from __future__ import annotations

import logging

import fastf1
import pandas as pd

from . import extract, positions, telemetry
from .supabase_sink import SupabaseSink

logger = logging.getLogger(__name__)

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


def ingest_session(sink: SupabaseSink, year: int, gp_name: str, session_type: str) -> str:
    """Load + normalize + upsert one session. Returns the session_key."""
    session_key = extract.make_session_key(year, gp_name, session_type)
    logger.info("Loading FastF1 session: %s", session_key)

    session = fastf1.get_session(year, gp_name, session_type)
    # Load everything once — telemetry=True pulls car_data + pos_data.
    session.load(laps=True, telemetry=True, weather=True, messages=True)
    laps_df = session.laps

    # ── Phase 1: session metadata, drivers, results, processed laps ──────────
    standings = extract.fetch_championship_standings(year)
    drivers = extract.extract_drivers(session, standings)
    session_results = extract.extract_session_results(session)
    weather_data = extract.extract_weather(session, laps_df)
    stints = extract.extract_stints(laps_df)
    processed_laps = extract.build_processed_laps(session, laps_df)
    ckey = extract.circuit_key(gp_name)

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
