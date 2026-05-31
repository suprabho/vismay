"""
Statistical analysis tools for the CrewAI agents.

Provides lap-time statistics, tire degradation rates, gap computations,
and percentile rankings over processed telemetry data from MongoDB.

Each public CrewAI `@tool` is a thin wrapper around a pure `*_impl` function.
The scoped-tools factory imports the impls directly so it can build closure-
bound, focus-locked variants without going through the LLM-callable shim.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np
from crewai.tools import tool

from ..utils import db_client


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_session(session_key: str) -> dict:
    return db_client.telemetry_sessions().find_one({"sessionKey": session_key}) or {}


def _get_laps(session_key: str) -> list[dict]:
    return _get_session(session_key).get("processedLaps", []) or []


_PIT_EVENTS = {"pit_in", "pit_out", "safety_car", "vsc"}


def _clean_lap(l: dict) -> bool:
    return (l.get("lapTimeSec") or 0) > 0 and not any(
        e in _PIT_EVENTS for e in (l.get("events") or [])
    )


def _driver_laps(laps: list[dict], driver_number: int) -> list[dict]:
    """Clean (representative) laps for a single driver — excludes pit in/out,
    safety car / VSC laps, and laps with no recorded time."""
    return [
        l for l in laps
        if l.get("driverNumber") == driver_number and _clean_lap(l)
    ]


def _driver_lap_diagnostics(session: dict, driver_number: int) -> dict:
    """Return a small diagnostic dict for callers that need to explain WHY a
    driver-level computation came back empty. Tells the LLM how many raw vs
    clean laps exist and whether the driver finished — enough signal to
    decide to pivot instead of retrying.
    """
    all_laps = session.get("processedLaps", []) or []
    raw = [l for l in all_laps if l.get("driverNumber") == driver_number]
    clean = [l for l in raw if _clean_lap(l)]
    result = next(
        (r for r in (session.get("sessionResults") or []) if r.get("driverNumber") == driver_number),
        None,
    )
    return {
        "driver_number":        driver_number,
        "raw_lap_count":        len(raw),
        "clean_lap_count":      len(clean),
        "dnf":                  bool(result.get("dnf")) if result else None,
        "dnf_reason":           result.get("dnfReason") if result else None,
        "classified_position":  result.get("classifiedPosition") or result.get("position") if result else None,
    }


# ── Pure implementations (reused by scoped wrappers) ─────────────────────────

def compute_tire_degradation_impl(session_key: str, driver_number: int) -> dict:
    """Pure impl — see compute_tire_degradation docstring."""
    session = _get_session(session_key)
    all_laps = session.get("processedLaps", []) or []
    laps = _driver_laps(all_laps, driver_number)
    if len(laps) < 4:
        # Give the LLM enough context to pivot instead of looping on this
        # driver. A DNF or sprint-format race with a handful of clean laps is
        # a *data fact*, not something the agent should retry.
        diag = _driver_lap_diagnostics(session, driver_number)
        return {
            "error": "insufficient_clean_laps",
            "message": (
                f"Driver {driver_number} has {diag['clean_lap_count']} clean lap(s) "
                f"({diag['raw_lap_count']} raw); tire-degradation regression needs ≥4."
            ),
            **diag,
            "suggestion": (
                "Pivot the angle: use the available laps for a single-stint pace "
                "snapshot, or anchor on stint length / DNF lap from sessionResults — "
                "do NOT retry this tool for this driver."
            ),
        }

    stints: dict[str, list[tuple[int, float]]] = {}
    for l in sorted(laps, key=lambda x: x.get("lap", 0)):
        compound = l.get("compound", "UNKNOWN")
        stints.setdefault(compound, []).append((l["lap"], l["lapTimeSec"]))

    results: list[dict[str, Any]] = []
    for compound, stint_laps in stints.items():
        if len(stint_laps) < 3:
            continue
        lap_nums = np.array([x[0] for x in stint_laps], dtype=float)
        times = np.array([x[1] for x in stint_laps], dtype=float)
        lap_nums_norm = lap_nums - lap_nums.min() + 1
        try:
            coeffs = np.polyfit(lap_nums_norm, times, 1)
        except (np.linalg.LinAlgError, ValueError):
            continue
        slope, intercept = float(coeffs[0]), float(coeffs[1])
        results.append({
            "compound": compound,
            "degradation_rate_per_lap_s": round(slope, 4),
            "base_lap_time_s": round(intercept, 3),
            "laps_analyzed": len(stint_laps),
        })

    overall_rate = float(np.mean([r["degradation_rate_per_lap_s"] for r in results])) if results else 0.0
    return {
        "driver_number": driver_number,
        "session_key": session_key,
        "overall_degradation_rate_per_lap_s": round(overall_rate, 4),
        "stint_breakdown": results,
    }


def compute_lap_percentile_impl(session_key: str, driver_number: int, lap_number: int) -> dict:
    """Pure impl — see compute_lap_percentile docstring."""
    session = _get_session(session_key)
    all_laps = session.get("processedLaps", []) or []

    target_laps = [
        l for l in all_laps
        if l.get("driverNumber") == driver_number and l.get("lap") == lap_number
    ]
    if not target_laps:
        diag = _driver_lap_diagnostics(session, driver_number)
        return {
            "error": "lap_not_found",
            "message": f"Driver {driver_number} has no record for lap {lap_number}.",
            **diag,
            "suggestion": "Use a lap from the driver's actual stint range or pivot the claim.",
        }

    target_time = target_laps[0].get("lapTimeSec")
    if target_time is None or target_time <= 0:
        return {
            "error": "no_valid_lap_time",
            "message": f"Driver {driver_number} lap {lap_number} has no timed entry (likely pit / VSC / SC lap).",
            "suggestion": "Pick a different lap or cite the lap as non-representative.",
        }

    field_times = [
        l["lapTimeSec"]
        for l in all_laps
        if l.get("lap") == lap_number and (l.get("lapTimeSec") or 0) > 0
    ]
    if not field_times:
        return {
            "error": "no_field_data",
            "message": f"No timed laps recorded for lap {lap_number} across the field.",
        }

    field_times_sorted = sorted(field_times)
    rank = field_times_sorted.index(min(field_times_sorted, key=lambda t: abs(t - target_time))) + 1
    percentile = round((rank / len(field_times_sorted)) * 100, 1)

    return {
        "driver_number": driver_number,
        "lap_number": lap_number,
        "lap_time_s": round(target_time, 3),
        "rank": rank,
        "field_size": len(field_times_sorted),
        "percentile": percentile,
        "fastest_s": round(field_times_sorted[0], 3),
        "gap_to_fastest_s": round(target_time - field_times_sorted[0], 3),
    }


def compute_gap_between_drivers_impl(
    session_key: str, driver_a: int, driver_b: int, lap_number: int,
) -> dict:
    """Pure impl — see compute_gap_between_drivers docstring."""
    all_laps = _get_laps(session_key)

    def get_times(dn: int) -> dict[int, float]:
        return {
            l["lap"]: l["lapTimeSec"]
            for l in all_laps
            if l.get("driverNumber") == dn and (l.get("lapTimeSec") or 0) > 0
        }

    times_a = get_times(driver_a)
    times_b = get_times(driver_b)

    shared_laps = sorted(set(times_a) & set(times_b))
    shared_laps = [l for l in shared_laps if l <= lap_number]

    if not shared_laps:
        # Surface enough context that the agent knows whether one of the
        # drivers DNF'd before the requested lap (the common case).
        diag_a = _driver_lap_diagnostics(_get_session(session_key), driver_a)
        diag_b = _driver_lap_diagnostics(_get_session(session_key), driver_b)
        return {
            "error": "no_shared_laps",
            "message": (
                f"No shared timed laps for drivers {driver_a} and {driver_b} through lap {lap_number}."
            ),
            "driver_a_diagnostics": diag_a,
            "driver_b_diagnostics": diag_b,
            "suggestion": (
                "If one driver retired before the requested lap, anchor the comparison "
                "on the earlier shared range instead — check sessionResults.dnf / dnfReason."
            ),
        }

    per_lap_delta = {lap: round(times_a[lap] - times_b[lap], 3) for lap in shared_laps}
    cumulative_gap = round(sum(per_lap_delta.values()), 3)

    return {
        "driver_a": driver_a,
        "driver_b": driver_b,
        "through_lap": lap_number,
        "cumulative_gap_s": cumulative_gap,
        "interpretation": f"Driver #{driver_a} is {'slower' if cumulative_gap > 0 else 'faster'} by {abs(cumulative_gap):.3f}s",
        "per_lap_deltas": per_lap_delta,
    }


def session_lap_summary_impl(
    session_key: str,
    driver_numbers: list[int] | None = None,
) -> dict:
    """Pure impl — see session_lap_summary docstring.

    `driver_numbers` (optional) restricts the summary to a focus set. When
    None, summarises every driver in the session.
    """
    all_laps = _get_laps(session_key)
    if not all_laps:
        return {"error": f"No laps found for session {session_key}"}

    keep: set[int] | None = (
        {int(n) for n in driver_numbers} if driver_numbers else None
    )

    by_driver: dict[int, list[float]] = {}
    for l in all_laps:
        dn = l.get("driverNumber", 0)
        if keep is not None and dn not in keep:
            continue
        if not _clean_lap(l):
            continue
        by_driver.setdefault(dn, []).append(float(l["lapTimeSec"]))

    summary = []
    for dn, times in sorted(by_driver.items()):
        arr = np.array(times)
        summary.append({
            "driver_number": dn,
            "laps": len(times),
            "mean_s": round(float(arr.mean()), 3),
            "std_s": round(float(arr.std()), 3),
            "fastest_s": round(float(arr.min()), 3),
            "slowest_s": round(float(arr.max()), 3),
        })
    summary.sort(key=lambda x: x["mean_s"])
    return {"session_key": session_key, "drivers": summary}


# ── CrewAI tool shims ─────────────────────────────────────────────────────────

@tool("compute_tire_degradation")
def compute_tire_degradation(session_key: str, driver_number: int) -> str:
    """
    Compute the tire degradation rate (seconds per lap) for a driver in a session.

    Uses a linear regression over representative laps per stint.
    Returns JSON with degradation_rate_per_lap, stint_count, total_laps_analyzed.
    """
    return json.dumps(compute_tire_degradation_impl(session_key, driver_number))


@tool("compute_lap_percentile")
def compute_lap_percentile(session_key: str, driver_number: int, lap_number: int) -> str:
    """
    Compute where a specific driver's lap ranks (as a percentile) among all drivers
    on that lap number. Returns JSON with lap_time_s, percentile, rank, field_size.

    A lower percentile means faster (e.g., percentile=5 means top 5%).
    """
    return json.dumps(compute_lap_percentile_impl(session_key, driver_number, lap_number))


@tool("compute_gap_between_drivers")
def compute_gap_between_drivers(
    session_key: str,
    driver_a: int,
    driver_b: int,
    lap_number: int,
) -> str:
    """
    Compute the cumulative lap time gap between two drivers up to a given lap.
    Returns JSON with gap_s (positive means driver_a is slower) and per-lap deltas.
    """
    return json.dumps(compute_gap_between_drivers_impl(session_key, driver_a, driver_b, lap_number))


@tool("session_lap_summary")
def session_lap_summary(session_key: str) -> str:
    """
    Return a statistical summary (mean, std, fastest, slowest) of lap times
    per driver for a session. Useful for quick context on the field's pace.
    """
    return json.dumps(session_lap_summary_impl(session_key))
