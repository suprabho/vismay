"""
LangGraph telemetry analysis pipeline.

DAG: load_session → [abort if no data] → normalize_laps → detect_events
     → detect_signals → detect_enriched_signals → build_projections
     → generate_graph_specs → [driver/team graph nodes]
     → llm_curate_insights (LLM: rank/enrich signals + curate graphs)
     → persist_results

Heuristics detect; the LLM interprets. The LLM node is best-effort — if disabled
or unreachable the pipeline still produces its full heuristic output.
"""

from __future__ import annotations

import logging
import operator
from typing import TypedDict, Optional, Any, Annotated

import numpy as np
import pandas as pd
from bson import ObjectId
from langgraph.graph import StateGraph, END

from ..utils import db_client
from ..utils.resilient import backend_post_bulk
from ..utils.json_parse import extract_json_object
from ..config import settings, get_llm_optional

logger = logging.getLogger(__name__)


# ── State ────────────────────────────────────────────────────────────────────

def _add_lists(a: list | None, b: list | None) -> list:
    return (a or []) + (b or [])


class TelemetryState(TypedDict, total=False):
    session_key: str
    story_id: str
    story_run_id: str
    context: str
    session_data: dict
    laps_df: Optional[pd.DataFrame]
    events: list[dict]
    signals: Annotated[list[dict], operator.add]
    projections: dict
    graph_specs: Annotated[list[dict], operator.add]
    team_graph_specs: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]
    fatal_error: Optional[str]   # set by load_session when there is nothing to analyse
    insight_summary: Optional[str]
    final_signals: list[dict]
    final_graph_specs: list[dict]
    final_team_graph_specs: list[dict]



# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_lap_time(t: Any) -> float:
    """Convert '1:21.432' or float seconds to float seconds."""
    if isinstance(t, (int, float)):
        return float(t)
    if isinstance(t, str) and ':' in t:
        parts = t.split(':')
        return int(parts[0]) * 60 + float(parts[1])
    try:
        return float(t)
    except (TypeError, ValueError):
        return float('nan')


COMPOUND_COLOR: dict[str, str] = {
    "soft":   "#E10600",
    "medium": "#FFD700",
    "hard":   "#CCCCCC",
    "inter":  "#39B54A",
    "wet":    "#005AFF",
}


def _load_raw_telemetry_lap(session_key: str, driver_number: int, lap: int) -> dict | None:
    """Fetch a single driver×lap raw telemetry doc."""
    return db_client.raw_lap_telemetry().find_one(
        {"sessionKey": session_key, "driverNumber": driver_number, "lap": lap},
        {"_id": 0, "sessionTime": 1, "speed": 1, "throttle": 1, "brake": 1,
         "drs": 1, "nGear": 1, "rpm": 1, "distance": 1},
    )


def _load_raw_telemetry_driver(session_key: str, driver_number: int, projection: dict) -> list[dict]:
    """All raw telemetry docs for a driver in a session, sorted by lap."""
    return list(db_client.raw_lap_telemetry().find(
        {"sessionKey": session_key, "driverNumber": driver_number},
        {"_id": 0, **projection},
    ).sort("lap", 1))


def _downsample_arrays(arrays: dict[str, list], target_points: int = 200) -> dict[str, list]:
    """Stride-based downsample of parallel arrays. Keeps payload bounded."""
    first = next(iter(arrays.values()), [])
    n = len(first)
    if n <= target_points:
        return arrays
    step = max(1, n // target_points)
    return {k: v[::step] for k, v in arrays.items()}


def _driver_palette(driver_number: int, drivers_meta: dict) -> str:
    """Reuse drivers[].teamColour for series color consistency."""
    meta = drivers_meta.get(int(driver_number)) or {}
    return meta.get("teamColour") or "#171717"


def _clamp_signal(sig: dict) -> dict:
    """Defensive truncation against schema length caps (title 300, location 100)."""
    out = dict(sig)
    if isinstance(out.get("title"), str) and len(out["title"]) > 300:
        out["title"] = out["title"][:300]
    if isinstance(out.get("location"), str) and len(out["location"]) > 100:
        out["location"] = out["location"][:100]
    return out


def _total_laps(state: "TelemetryState") -> int:
    """Best estimate of the session's lap count — used to make thresholds
    relative to session length instead of hardcoded race-distance assumptions."""
    df = state.get("laps_df")
    if df is not None and not df.empty and "lap" in df.columns:
        try:
            return int(pd.to_numeric(df["lap"], errors="coerce").max())
        except (ValueError, TypeError):
            pass
    laps = (state.get("session_data") or {}).get("processedLaps") or []
    return max((int(l.get("lap", 0) or 0) for l in laps), default=0)


def _update_run_status(run_id: str, status: str, log: str | None = None) -> None:
    try:
        db_client.story_runs().update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {"status": status}, **({"$push": {"logs": log}} if log else {})},
        )
    except Exception as e:
        logger.warning("Could not update run status: %s", e)


# ── Nodes ─────────────────────────────────────────────────────────────────────

def load_session(state: TelemetryState) -> TelemetryState:
    doc = db_client.telemetry_sessions().find_one({"sessionKey": state["session_key"]})
    if not doc:
        msg = f"Session {state['session_key']} not found in MongoDB"
        state["errors"].append(msg)
        state["session_data"] = {}
        state["fatal_error"] = msg
        _update_run_status(state["story_run_id"], "running", f"load_session: {msg}")
        return state

    doc["_id"] = str(doc["_id"])
    state["session_data"] = doc

    # No lap data → nothing for any downstream node to analyse. Treat as fatal so
    # the run fails loudly instead of silently completing with zero output.
    if not (doc.get("processedLaps") or []):
        msg = f"Session {state['session_key']} has no processedLaps — nothing to analyse"
        state["errors"].append(msg)
        state["fatal_error"] = msg
        _update_run_status(state["story_run_id"], "running", f"load_session: {msg}")
        return state

    tel_status = doc.get("telemetryStatus")
    if tel_status != "done":
        logger.warning(
            "Session %s telemetryStatus=%s — raw-telemetry nodes will skip",
            state["session_key"], tel_status,
        )
        _update_run_status(
            state["story_run_id"], "running",
            f"load_session: telemetryStatus={tel_status} (raw-telemetry graphs may be empty)",
        )
    else:
        _update_run_status(state["story_run_id"], "running", "load_session complete")
    return state


def normalize_laps(state: TelemetryState) -> TelemetryState:
    laps = state["session_data"].get("processedLaps", [])
    if not laps:
        state["errors"].append("No processedLaps in session data")
        state["laps_df"] = pd.DataFrame()
        return state

    df = pd.DataFrame(laps)
    if "lapTimeSec" not in df.columns:
        df["lapTimeSec"] = df.get("lapTime", pd.Series(dtype=float)).apply(_parse_lap_time)
    else:
        df["lapTimeSec"] = pd.to_numeric(df["lapTimeSec"], errors="coerce")
    df = df.dropna(subset=["lapTimeSec"])

    pit_events = {"pit_in", "pit_out", "safety_car", "vsc"}
    if "events" in df.columns:
        df["isRepresentative"] = ~df["events"].apply(
            lambda evts: any(e in pit_events for e in (evts or []))
        )
    else:
        df["isRepresentative"] = True

    state["laps_df"] = df
    _update_run_status(state["story_run_id"], "running", f"normalize_laps: {len(df)} laps")
    return state


def detect_events(state: TelemetryState) -> TelemetryState:
    df = state.get("laps_df")
    if df is None or df.empty:
        return state

    events: list[dict] = []
    rc = state["session_data"].get("raceControlMessages", [])
    for msg in rc:
        events.append({
            "lap":     msg.get("lap"),
            "type":    msg.get("category", "unknown"),
            "message": msg.get("message", ""),
        })

    # Personal bests per driver — over representative (clean) laps only, so an
    # in/out lap can't masquerade as a personal best.
    if "driverNumber" in df.columns and "lapTimeSec" in df.columns:
        clean = df[df["isRepresentative"]] if "isRepresentative" in df.columns else df
        for drv, grp in clean.groupby("driverNumber"):
            if grp.empty:
                continue
            min_idx = grp["lapTimeSec"].idxmin()
            events.append({
                "lap": int(grp.loc[min_idx, "lap"]) if "lap" in grp.columns else None,
                "type": "personal_best",
                "driverNumber": int(drv),
                "value": float(grp.loc[min_idx, "lapTimeSec"]),
            })

    state["events"] = events
    _update_run_status(state["story_run_id"], "running", f"detect_events: {len(events)} events")
    return state


def detect_signals(state: TelemetryState) -> TelemetryState:
    df = state.get("laps_df")
    if df is None or df.empty or "driverNumber" not in df.columns:
        state["signals"] = []
        return state

    signals: list[dict] = []
    for drv, grp in df[df["isRepresentative"]].groupby("driverNumber"):
        grp = grp.sort_values("lap") if "lap" in grp.columns else grp
        if len(grp) < 3:
            continue
        rolling = grp["lapTimeSec"].rolling(3, center=True, min_periods=1).mean()
        delta = grp["lapTimeSec"] - rolling
        spikes = grp[delta > 0.8]
        for _, row in spikes.iterrows():
            d_val = float(delta[row.name])
            signals.append({
                "sessionKey": state["session_key"],
                "driverNumber": int(drv),
                "lap": int(row.get("lap", 0)),
                "location": "Track",
                "type": "lap_time_spike",
                "value": round(d_val, 3),
                "priority": "high" if d_val > 1.5 else "med",
                "title": f"Lap time spike +{d_val:.2f}s above rolling avg",
                "meaning": f"Driver #{drv} was {d_val:.2f}s slower than their 3-lap rolling average on this lap.",
                "implication": "Possible tire graining, traffic, or setup issue.",
                "aiGenerated": True,
            })

    _update_run_status(state["story_run_id"], "running", f"detect_signals: {len(signals)} signals")
    return {"signals": signals}


def detect_enriched_signals(state: TelemetryState) -> TelemetryState:
    """Generate new signals from sessionResults, weatherData, stints, and lapTelemetryAggregates."""
    from collections import defaultdict
    sd = state["session_data"]
    new_signals: list[dict] = []
    sk = state["session_key"]

    weather_data = sd.get("weatherData",            [])
    stints       = sd.get("stints",                 [])
    results      = sd.get("sessionResults",          [])
    tel_aggs_raw = sd.get("lapTelemetryAggregates", [])

    tel_index: dict[tuple[int, int], dict] = {
        (a["driverNumber"], a["lap"]): a for a in tel_aggs_raw
    }

    # ── Rain impact ──────────────────────────────────────────────────────────
    rain_laps = {w["lap"] for w in weather_data if w.get("rainfall")}
    df = state.get("laps_df")
    if rain_laps and df is not None and not df.empty and "lapTimeSec" in df.columns:
        avg_time = float(df["lapTimeSec"].mean())
        for _, row in df[df["lap"].isin(rain_laps)].iterrows():
            delta = float(row["lapTimeSec"]) - avg_time
            if delta > 1.5:
                drv = int(row.get("driverNumber", 0))
                new_signals.append({
                    "sessionKey":   sk,
                    "driverNumber": drv,
                    "lap":          int(row.get("lap", 0)),
                    "location":     "Track",
                    "type":         "rain_impact",
                    "value":        round(delta, 3),
                    "priority":     "high" if delta > 3.0 else "med",
                    "title":        f"Rain impact: +{delta:.2f}s on wet lap",
                    "meaning":      f"Driver #{drv} lost {delta:.2f}s vs session avg on a lap with rainfall.",
                    "implication":  "Tyre choice and wet-weather pace critical here.",
                    "aiGenerated":  True,
                })

    # ── Grid vs finish delta ──────────────────────────────────────────────────
    for res in results:
        grid   = res.get("gridPosition")
        finish = res.get("position")
        drv    = res.get("driverNumber")
        if grid is not None and finish is not None and drv:
            delta = grid - finish
            if abs(delta) >= 5:
                drv_i = int(drv)
                new_signals.append({
                    "sessionKey":   sk,
                    "driverNumber": drv_i,
                    "lap":          None,
                    "location":     "Race",
                    "type":         "grid_vs_finish_delta",
                    "value":        float(delta),
                    "priority":     "high" if abs(delta) >= 8 else "med",
                    "title":        f"Driver #{drv_i} {'gained' if delta > 0 else 'lost'} {abs(delta)} positions",
                    "meaning":      f"Started P{grid}, finished P{finish} ({'+' if delta > 0 else ''}{delta} positions).",
                    "implication":  "Strategy, pace, or incidents shaped this result.",
                    "aiGenerated":  True,
                })

    # ── Pit delta spike ────────────────────────────────────────────────────────
    pit_deltas = [s["pitDeltaSec"] for s in stints if s.get("pitDeltaSec") is not None]
    if pit_deltas:
        avg_pit = float(np.mean(pit_deltas))
        std_pit = float(np.std(pit_deltas)) if len(pit_deltas) > 1 else 5.0
        for stint in stints:
            pd_sec = stint.get("pitDeltaSec")
            if pd_sec is not None and pd_sec > 30 and pd_sec > avg_pit + 2 * std_pit:
                drv = int(stint["driverNumber"])
                pit_in = stint.get("pitInLap")
                new_signals.append({
                    "sessionKey":   sk,
                    "driverNumber": drv,
                    "lap":          int(pit_in) if pit_in is not None else None,
                    "location":     "Pit Lane",
                    "type":         "pit_delta_spike",
                    "value":        round(pd_sec, 2),
                    "priority":     "high",
                    "title":        f"Driver #{drv} pit stop took {pd_sec:.1f}s",
                    "meaning":      f"Pit stop was {pd_sec - avg_pit:.1f}s longer than session average ({avg_pit:.1f}s).",
                    "implication":  "Possible mechanical issue, unsafe release, or pit crew error.",
                    "aiGenerated":  True,
                })

    # ── Strategy divergence ───────────────────────────────────────────────────
    if results and stints:
        # Mid-race window scaled to session length (was hardcoded 25–40, which is
        # wrong for sprints, Monaco, or red-flag-shortened races).
        total_laps = _total_laps(state)
        if total_laps >= 10:
            mid_lo = int(round(total_laps * 0.35))
            mid_hi = int(round(total_laps * 0.60))
        else:
            mid_lo, mid_hi = 0, total_laps
        top3 = sorted(
            [r for r in results if r.get("position") is not None],
            key=lambda r: r["position"],
        )[:3]
        top3_dnums = {r["driverNumber"] for r in top3}
        midpoint_compounds: dict[int, set[str]] = {}
        for stint in stints:
            dn = stint["driverNumber"]
            if dn not in top3_dnums:
                continue
            if mid_lo <= stint["startLap"] <= mid_hi or mid_lo <= stint["endLap"] <= mid_hi:
                midpoint_compounds.setdefault(dn, set()).add(stint["compound"])
        all_compounds: set[str] = set()
        for compounds in midpoint_compounds.values():
            all_compounds |= compounds
        if len(top3_dnums) >= 3 and len(all_compounds) >= 3:
            drv_list      = ", ".join(f"#{d}" for d in top3_dnums)
            compounds_str = ", ".join(sorted(all_compounds))
            new_signals.append({
                "sessionKey":   sk,
                "driverNumber": None,
                "lap":          None,
                "location":     "Strategy",
                "type":         "strategy_divergence",
                "value":        float(len(all_compounds)),
                "priority":     "med",
                "title":        "Three-way strategy split at mid-race",
                "meaning":      f"Top-3 drivers ({drv_list}) ran {compounds_str} at mid-race.",
                "implication":  "Diverging strategies create late-race overtaking opportunities.",
                "aiGenerated":  True,
            })

    # ── Overtake proximity ────────────────────────────────────────────────────
    if tel_index:
        close_laps: dict[int, list[int]] = defaultdict(list)
        for (dn, lap_num), agg in tel_index.items():
            if agg.get("minGapToAheadM", 9999) < 500:
                close_laps[dn].append(lap_num)
        for drv, laps_list in close_laps.items():
            laps_sorted = sorted(laps_list)
            for i in range(len(laps_sorted) - 1):
                if laps_sorted[i + 1] - laps_sorted[i] == 1:
                    agg   = tel_index.get((drv, laps_sorted[i]), {})
                    gap_m = agg.get("minGapToAheadM", 0)
                    new_signals.append({
                        "sessionKey":   sk,
                        "driverNumber": int(drv),
                        "lap":          int(laps_sorted[i]),
                        "location":     "Track",
                        "type":         "overtake_proximity",
                        "value":        round(gap_m, 1),
                        "priority":     "high" if gap_m < 100 else "med",
                        "title":        f"Driver #{drv} within {gap_m:.0f}m of car ahead for 2+ laps",
                        "meaning":      f"Driver #{drv} maintained close proximity to the car ahead on laps {laps_sorted[i]}–{laps_sorted[i+1]}.",
                        "implication":  "DRS activation or overtaking attempt likely.",
                        "aiGenerated":  True,
                    })
                    break

    # ── Tire deg speed loss ───────────────────────────────────────────────────
    if tel_index and stints:
        for stint in stints:
            dn          = stint["driverNumber"]
            stint_laps  = range(stint["startLap"], stint["endLap"] + 1)
            aggs        = [tel_index[(dn, lap)] for lap in stint_laps if (dn, lap) in tel_index]
            if len(aggs) < 5:
                continue
            baseline = aggs[0].get("avgSpeed", 0)
            for agg in aggs[3:]:
                drop = baseline - agg.get("avgSpeed", baseline)
                if drop > 5:
                    new_signals.append({
                        "sessionKey":   sk,
                        "driverNumber": int(dn),
                        "lap":          int(agg["lap"]),
                        "location":     "Track",
                        "type":         "tire_deg_speed_loss",
                        "value":        round(drop, 2),
                        "priority":     "high" if drop > 10 else "med",
                        "title":        f"Driver #{dn} avg speed dropped {drop:.1f} km/h on aged tyres",
                        "meaning":      f"Stint avg speed fell {drop:.1f} km/h below lap-1 baseline on {stint['compound']} compound.",
                        "implication":  "Tyre degradation or graining reducing pace. Pit stop window opening.",
                        "aiGenerated":  True,
                    })
                    break

    # ── Undercut / Overcut ────────────────────────────────────────────────────
    stint_by_driver: dict[int, list[dict]] = {}
    for stint in stints:
        stint_by_driver.setdefault(stint["driverNumber"], []).append(stint)

    driver_nums = list(stint_by_driver.keys())
    for i, dn_a in enumerate(driver_nums):
        for dn_b in driver_nums[i + 1:]:
            stints_a = sorted(stint_by_driver[dn_a], key=lambda s: s["stintNumber"])
            stints_b = sorted(stint_by_driver[dn_b], key=lambda s: s["stintNumber"])
            pit_a    = next((s["pitInLap"] for s in stints_a if s.get("pitInLap")), None)
            pit_b    = next((s["pitInLap"] for s in stints_b if s.get("pitInLap")), None)
            if pit_a is None or pit_b is None:
                continue
            gap = pit_a - pit_b
            if 2 <= gap <= 5:
                new_signals.append({
                    "sessionKey":   sk,
                    "driverNumber": int(dn_a),
                    "lap":          int(pit_b),
                    "location":     "Pit Lane",
                    "type":         "overcut_attempt",
                    "value":        float(gap),
                    "priority":     "med",
                    "title":        f"Driver #{dn_a} overcut attempt vs #{dn_b}",
                    "meaning":      f"Driver #{dn_a} stayed out {gap} laps after #{dn_b} pitted, attempting to overcut.",
                    "implication":  f"Track position vs fresh tyre pace trade-off. Check if position held after #{dn_b}'s out-lap.",
                    "aiGenerated":  True,
                })
            elif -5 <= gap <= -2:
                new_signals.append({
                    "sessionKey":   sk,
                    "driverNumber": int(dn_a),
                    "lap":          int(pit_a),
                    "location":     "Pit Lane",
                    "type":         "undercut_attempt",
                    "value":        float(abs(gap)),
                    "priority":     "med",
                    "title":        f"Driver #{dn_a} undercut attempt vs #{dn_b}",
                    "meaning":      f"Driver #{dn_a} pitted {abs(gap)} laps earlier than #{dn_b}, attempting to undercut on fresher tyres.",
                    "implication":  f"If #{dn_a} emerged ahead after #{dn_b}'s pit stop, undercut succeeded.",
                    "aiGenerated":  True,
                })

    # ── DRS underperformance ──────────────────────────────────────────────────
    if tel_index:
        for dn in {k[0] for k in tel_index}:
            sorted_aggs = sorted(
                [tel_index[k] for k in tel_index if k[0] == dn],
                key=lambda a: a["lap"],
            )
            for i in range(1, len(sorted_aggs)):
                prev = sorted_aggs[i - 1]
                curr = sorted_aggs[i]
                if curr.get("drsActivations", 0) > 2:
                    gap_change = curr.get("avgGapToAheadM", 0) - prev.get("avgGapToAheadM", 0)
                    if gap_change > 0:
                        new_signals.append({
                            "sessionKey":   sk,
                            "driverNumber": int(dn),
                            "lap":          int(curr["lap"]),
                            "location":     "Track",
                            "type":         "drs_underperform",
                            "value":        round(gap_change, 1),
                            "priority":     "low",
                            "title":        f"Driver #{dn} DRS active but gap increased by {gap_change:.0f}m",
                            "meaning":      f"DRS was activated {curr['drsActivations']}x on lap {curr['lap']} but average gap to the car ahead grew by {gap_change:.0f}m.",
                            "implication":  "Rival car faster in straight-line speed, or DRS zone too short to close gap.",
                            "aiGenerated":  True,
                        })
                        break

    # ── Qualifying sector outlier ─────────────────────────────────────────────
    if tel_index:
        for sector, key in enumerate(
            ["sector1MaxSpeed", "sector2MaxSpeed", "sector3MaxSpeed"], start=1
        ):
            all_vals = [a[key] for a in tel_index.values() if a.get(key, 0) > 0]
            if len(all_vals) < 5:
                continue
            mean_s    = float(np.mean(all_vals))
            std_s     = float(np.std(all_vals))
            threshold = mean_s + 2 * std_s
            for (dn, lap_num), agg in tel_index.items():
                val = agg.get(key, 0)
                if val > threshold:
                    new_signals.append({
                        "sessionKey":   sk,
                        "driverNumber": int(dn),
                        "lap":          int(lap_num),
                        "location":     f"Sector {sector}",
                        "type":         "quali_sector_outlier",
                        "value":        round(val, 2),
                        "priority":     "med",
                        "title":        f"Driver #{dn} sector {sector} max speed {val:.1f} km/h (field +2σ)",
                        "meaning":      f"Sector {sector} peak speed of {val:.1f} km/h is more than 2 standard deviations above the field mean ({mean_s:.1f} km/h).",
                        "implication":  "Exceptional straight-line speed — check wing angle or DRS usage in this sector.",
                        "aiGenerated":  True,
                    })

    _update_run_status(state["story_run_id"], "running", f"detect_enriched_signals: {len(new_signals)} new signals")
    return {"signals": new_signals}


def build_projections(state: TelemetryState) -> TelemetryState:
    df = state.get("laps_df")
    if df is None or df.empty or "driverNumber" not in df.columns:
        state["projections"] = {}
        return state

    projections: dict[str, dict] = {}
    for drv, grp in df[df["isRepresentative"]].groupby("driverNumber"):
        grp = grp.sort_values("lap") if "lap" in grp.columns else grp
        if len(grp) < 5:
            continue
        laps_arr = grp["lap"].values.astype(float) if "lap" in grp.columns else np.arange(len(grp), dtype=float)
        times_arr = grp["lapTimeSec"].values

        # Polynomial degree-2 fit (captures tire degradation curve)
        try:
            coeffs = np.polyfit(laps_arr, times_arr, 2)
        except np.linalg.LinAlgError:
            continue

        max_lap = laps_arr.max()
        future_laps = np.arange(max_lap + 1, max_lap + 11)
        projected = np.polyval(coeffs, future_laps)
        residuals = times_arr - np.polyval(coeffs, laps_arr)
        std = float(np.std(residuals))

        projections[str(drv)] = {
            "historicalLaps": laps_arr.tolist(),
            "historicalTimes": times_arr.tolist(),
            "projectedLaps": future_laps.tolist(),
            "projectedTimes": projected.tolist(),
            "confidenceBand": std,
        }

    _update_run_status(state["story_run_id"], "running", f"build_projections: {len(projections)} drivers")
    return {"projections": projections}


def generate_graph_specs(state: TelemetryState) -> TelemetryState:
    specs: list[dict] = []
    proj = state["projections"]
    df = state.get("laps_df")

    # Projection chart per driver
    for drv_str, p in proj.items():
        data_points = [
            *[{"lap": l, "actual": t} for l, t in zip(p["historicalLaps"], p["historicalTimes"])],
            *[{"lap": l, "projected": t} for l, t in zip(p["projectedLaps"], p["projectedTimes"])],
        ]
        specs.append({
            "type": "projection",
            "title": f"Driver #{drv_str} — Lap Time Projection",
            "sessionKey": state["session_key"],
            "xAxis": {"key": "lap", "label": "Lap", "unit": "lap"},
            "yAxis": {"key": "lapTime", "label": "Lap Time (s)", "unit": "s"},
            "series": [
                {"id": "actual", "label": "Actual", "driverNumber": int(drv_str),
                 "color": "#171717", "dataKey": "actual", "type": "actual"},
                {"id": "projected", "label": "Projected", "driverNumber": int(drv_str),
                 "color": "#E10600", "dataKey": "projected", "type": "projected",
                 "strokeDash": "4 2"},
            ],
            "dataPoints": data_points,
            "projectionConfig": {
                "method": "polynomial",
                "historicalLaps": len(p["historicalLaps"]),
                "forecastLaps": 10,
                "confidenceBand": True,
            },
            "generatedByAI": True,
        })

    # Multi-line comparison chart (all drivers)
    if df is not None and not df.empty and "driverNumber" in df.columns:
        drivers = df["driverNumber"].unique()[:5]  # cap at 5 for readability
        palette = ["#E10600", "#1E3A5F", "#FF8700", "#00D2BE", "#7B3F00"]
        comparison_data: dict[float, dict] = {}
        for i, drv in enumerate(drivers):
            grp = df[(df["driverNumber"] == drv) & df["isRepresentative"]].sort_values("lap") if "lap" in df.columns else df[df["driverNumber"] == drv]
            for _, row in grp.iterrows():
                lap_key = float(row.get("lap", 0))
                if lap_key not in comparison_data:
                    comparison_data[lap_key] = {"lap": lap_key}
                comparison_data[lap_key][f"drv_{drv}"] = round(float(row["lapTimeSec"]), 3)

        specs.append({
            "type": "multi_line",
            "title": "Lap Time Comparison",
            "sessionKey": state["session_key"],
            "xAxis": {"key": "lap", "label": "Lap", "unit": "lap"},
            "yAxis": {"key": "lapTime", "label": "Lap Time (s)", "unit": "s"},
            "series": [
                {"id": f"drv_{drv}", "label": f"#{drv}", "driverNumber": int(drv),
                 "color": palette[i % len(palette)], "dataKey": f"drv_{drv}", "type": "actual"}
                for i, drv in enumerate(drivers)
            ],
            "dataPoints": sorted(comparison_data.values(), key=lambda x: x["lap"]),
            "generatedByAI": True,
        })

    _update_run_status(state["story_run_id"], "running", f"generate_graph_specs: {len(specs)} specs")
    return {"graph_specs": specs}


def generate_team_graph_specs(state: TelemetryState) -> TelemetryState:
    """Build one 'team pace' bar chart per unique team in the session."""
    df = state.get("laps_df")
    team_specs: list[dict] = []

    if df is None or df.empty or "driverNumber" not in df.columns:
            return {"team_graph_specs": []}

    drivers = (state.get("session_data") or {}).get("drivers") or []
    if not drivers:
            return {"team_graph_specs": []}

    driver_to_team = {
        int(d["driverNumber"]): {
            "teamId":     d.get("teamId"),
            "teamName":   d.get("teamName") or "Unknown",
            "teamColour": d.get("teamColour") or "#666666",
        }
        for d in drivers if d.get("driverNumber") is not None
    }

    df_clean = df[df["isRepresentative"]] if "isRepresentative" in df.columns else df
    by_team: dict[str, dict] = {}
    for _, row in df_clean.iterrows():
        dn = int(row.get("driverNumber") or 0)
        meta = driver_to_team.get(dn)
        if not meta or not meta.get("teamId"):
            continue
        tid = meta["teamId"]
        rec = by_team.setdefault(tid, {
            "teamId":   tid,
            "teamName": meta["teamName"],
            "color":    meta["teamColour"],
            "lapTimes": [],
        })
        try:
            rec["lapTimes"].append(float(row["lapTimeSec"]))
        except (TypeError, ValueError, KeyError):
            continue

    data_points = []
    for tid, rec in by_team.items():
        if not rec["lapTimes"]:
            continue
        arr = np.array(rec["lapTimes"], dtype=float)
        data_points.append({
            "teamId":     tid,
            "team":       rec["teamName"],
            "avgLapTime": round(float(np.mean(arr)), 3),
            "bestLapTime": round(float(np.min(arr)), 3),
            "color":      rec["color"],
        })

    if data_points:
        team_specs.append({
            "type": "bar",
            "title": "Team Pace — Average Clean Lap",
            "sessionKey": state["session_key"],
            "xAxis": {"key": "team", "label": "Team", "unit": ""},
            "yAxis": {"key": "avgLapTime", "label": "Avg Lap (s)", "unit": "s"},
            "series": [
                {"id": "avgLap", "label": "Avg Lap", "color": "#171717",
                 "dataKey": "avgLapTime", "type": "actual"},
            ],
            "dataPoints": sorted(data_points, key=lambda x: x["avgLapTime"]),
            "generatedByAI": True,
        })

        # one per-team detail spec (bestLap + avgLap)
        for dp in data_points:
            team_specs.append({
                "type": "bar",
                "title": f"{dp['team']} — Pace Summary",
                "sessionKey": state["session_key"],
                "teamId":   dp["teamId"],
                "teamName": dp["team"],
                "xAxis": {"key": "metric", "label": "Metric", "unit": ""},
                "yAxis": {"key": "value", "label": "Lap Time (s)", "unit": "s"},
                "series": [
                    {"id": "value", "label": "Lap Time", "color": dp["color"],
                     "dataKey": "value", "type": "actual"},
                ],
                "dataPoints": [
                    {"metric": "Best",    "value": dp["bestLapTime"]},
                    {"metric": "Average", "value": dp["avgLapTime"]},
                ],
                "generatedByAI": True,
            })

    _update_run_status(state["story_run_id"], "running", f"generate_team_graph_specs: {len(team_specs)} specs")
    return {"team_graph_specs": team_specs}


def generate_driver_lap_traces(state: TelemetryState) -> TelemetryState:
    """Multi-line speed/throttle/brake trace for each driver's fastest lap."""
    df = state.get("laps_df")
    sk = state["session_key"]
    specs = []

    if df is None or df.empty or "driverNumber" not in df.columns:
        return {"graph_specs": specs}

    drivers_meta = {
        int(d["driverNumber"]): d
        for d in (state.get("session_data") or {}).get("drivers", [])
        if d.get("driverNumber") is not None
    }

    added = 0
    for drv, grp in df[df["isRepresentative"]].groupby("driverNumber"):
        try:
            if len(grp) < 5 or "lapTimeSec" not in grp.columns or "lap" not in grp.columns:
                continue
            fastest_row = grp.loc[grp["lapTimeSec"].idxmin()]
            fastest_lap = int(fastest_row["lap"])
            doc = _load_raw_telemetry_lap(sk, int(drv), fastest_lap)
            if not doc or not doc.get("distance"):
                continue
            arrays = _downsample_arrays({
                "distance": doc.get("distance") or [],
                "speed":    doc.get("speed") or [],
                "throttle": doc.get("throttle") or [],
                "brake":    doc.get("brake") or [],
            })
            dist = arrays["distance"]
            spd = arrays["speed"]
            thr = arrays["throttle"]
            brk = arrays["brake"]
            if not dist or not spd:
                continue
            data_points = [
                {
                    "distance": round(float(d), 1),
                    "speed":    round(float(spd[i]), 1) if i < len(spd) else None,
                    "throttle": round(float(thr[i]), 1) if i < len(thr) else None,
                    "brake":    int(brk[i]) * 100 if i < len(brk) else 0,
                }
                for i, d in enumerate(dist)
            ]
            color = _driver_palette(int(drv), drivers_meta)
            specs.append({
                "type": "multi_line",
                "title": f"Driver #{int(drv)} — Fastest Lap Trace (Lap {fastest_lap})",
                "sessionKey": sk,
                "xAxis": {"key": "distance", "label": "Distance (m)", "unit": "m"},
                "yAxis": {"key": "value",    "label": "Speed (km/h) / Throttle·Brake (%)", "unit": ""},
                "series": [
                    {"id": "speed",    "label": "Speed",    "driverNumber": int(drv), "color": color,     "dataKey": "speed",    "type": "actual"},
                    {"id": "throttle", "label": "Throttle", "driverNumber": int(drv), "color": "#39B54A", "dataKey": "throttle", "type": "actual"},
                    {"id": "brake",    "label": "Brake",    "driverNumber": int(drv), "color": "#E10600", "dataKey": "brake",    "type": "actual"},
                ],
                "dataPoints": data_points,
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_lap_traces drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_lap_traces: {added} specs")
    return {"graph_specs": specs}


def generate_driver_stint_degradation(state: TelemetryState) -> TelemetryState:
    """Multi-line lap-time vs stintLap per driver, one series per stint."""
    df = state.get("laps_df")
    sk = state["session_key"]
    specs = []
    stints = (state.get("session_data") or {}).get("stints") or []

    if df is None or df.empty or not stints or "driverNumber" not in df.columns:
        return {"graph_specs": specs}

    stints_by_driver: dict[int, list[dict]] = {}
    for st in stints:
        dn = st.get("driverNumber")
        if dn is None:
            continue
        stints_by_driver.setdefault(int(dn), []).append(st)

    added = 0
    for drv, drv_stints in stints_by_driver.items():
        try:
            drv_stints_sorted = sorted(drv_stints, key=lambda s: s.get("stintNumber", 0))
            drv_laps = df[(df["driverNumber"] == drv) & df["isRepresentative"]]
            if drv_laps.empty:
                continue

            stint_lap_max = 0
            series: list[dict] = []
            data_by_stintlap: dict[int, dict] = {}
            for st in drv_stints_sorted:
                n = int(st.get("stintNumber") or 0)
                compound = (st.get("compound") or "hard").lower()
                start_lap = st.get("startLap")
                end_lap = st.get("endLap")
                if start_lap is None or end_lap is None:
                    continue
                stint_laps = drv_laps[(drv_laps["lap"] >= start_lap) & (drv_laps["lap"] <= end_lap)].sort_values("lap")
                if len(stint_laps) < 2:
                    continue
                color = COMPOUND_COLOR.get(compound, "#999999")
                key = f"stint{n}"
                series.append({
                    "id": key,
                    "label": f"Stint {n} ({compound})",
                    "driverNumber": int(drv),
                    "color": color,
                    "dataKey": key,
                    "type": "actual",
                })
                for _, row in stint_laps.iterrows():
                    sl = int(row.get("stintLap") or (row["lap"] - start_lap + 1))
                    stint_lap_max = max(stint_lap_max, sl)
                    bucket = data_by_stintlap.setdefault(sl, {"stintLap": sl})
                    bucket[key] = round(float(row["lapTimeSec"]), 3)

            if not series or not data_by_stintlap:
                continue
            specs.append({
                "type": "multi_line",
                "title": f"Driver #{int(drv)} — Tyre Life vs Lap Time",
                "sessionKey": sk,
                "xAxis": {"key": "stintLap", "label": "Stint Lap", "unit": "lap"},
                "yAxis": {"key": "lapTime",  "label": "Lap Time (s)", "unit": "s"},
                "series": series,
                "dataPoints": [data_by_stintlap[k] for k in sorted(data_by_stintlap)],
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_stint_degradation drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_stint_degradation: {added} specs")
    return {"graph_specs": specs}


def generate_driver_sector_comparison(state: TelemetryState) -> TelemetryState:
    """bar_grouped: driver best sectors vs teammate vs session purple."""
    sd = state.get("session_data") or {}
    sk = state["session_key"]
    specs = []
    processed = sd.get("processedLaps") or []
    drivers = sd.get("drivers") or []

    if not processed or not drivers:
        return {"graph_specs": specs}

    drivers_meta = {int(d["driverNumber"]): d for d in drivers if d.get("driverNumber") is not None}

    # best S1/S2/S3 per driver
    best_by_drv: dict[int, list[float | None]] = {}
    for lap in processed:
        dn = lap.get("driverNumber")
        sectors = lap.get("sectors") or []
        if dn is None or len(sectors) < 3:
            continue
        dn = int(dn)
        cur = best_by_drv.setdefault(dn, [None, None, None])
        for i in range(3):
            v = sectors[i]
            if v is None:
                continue
            try:
                vf = float(v)
            except (TypeError, ValueError):
                continue
            if cur[i] is None or vf < cur[i]:
                cur[i] = vf

    # session purple per sector
    purple = [None, None, None]
    for sec_vals in best_by_drv.values():
        for i in range(3):
            v = sec_vals[i]
            if v is None:
                continue
            if purple[i] is None or v < purple[i]:
                purple[i] = v

    # team → list[driverNumber]
    team_drivers: dict[str, list[int]] = {}
    for d in drivers:
        tid = d.get("teamId")
        dn = d.get("driverNumber")
        if tid and dn is not None:
            team_drivers.setdefault(tid, []).append(int(dn))

    added = 0
    for drv, best in best_by_drv.items():
        try:
            meta = drivers_meta.get(drv)
            if not meta or not meta.get("teamId"):
                continue
            teammates = [d for d in team_drivers.get(meta["teamId"], []) if d != drv]
            if not teammates:
                continue
            tm = teammates[0]
            tm_best = best_by_drv.get(tm)
            if not tm_best:
                continue
            color = _driver_palette(drv, drivers_meta)
            data_points = [
                {"sector": f"S{i+1}",
                 "self":     round(best[i], 3) if best[i] is not None else None,
                 "teammate": round(tm_best[i], 3) if tm_best[i] is not None else None,
                 "purple":   round(purple[i], 3) if purple[i] is not None else None}
                for i in range(3)
            ]
            specs.append({
                "type": "bar_grouped",
                "title": f"Driver #{drv} — Sectors vs #{tm} vs Session Purple",
                "sessionKey": sk,
                "xAxis": {"key": "sector", "label": "Sector", "unit": ""},
                "yAxis": {"key": "time",   "label": "Sector Time (s)", "unit": "s"},
                "series": [
                    {"id": "self",     "label": f"#{drv}",         "driverNumber": drv, "color": color,     "dataKey": "self",     "type": "actual"},
                    {"id": "teammate", "label": f"#{tm}",          "driverNumber": drv, "color": "#888888", "dataKey": "teammate", "type": "reference"},
                    {"id": "purple",   "label": "Session Purple",  "driverNumber": drv, "color": "#A020F0", "dataKey": "purple",   "type": "reference"},
                ],
                "dataPoints": data_points,
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_sector_comparison drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_sector_comparison: {added} specs")
    return {"graph_specs": specs}


def generate_driver_gear_distribution(state: TelemetryState) -> TelemetryState:
    """Bar chart: % time spent in each gear (1–8) per driver across the session."""
    df = state.get("laps_df")
    sk = state["session_key"]
    specs = []

    if df is None or df.empty or "driverNumber" not in df.columns:
        return {"graph_specs": specs}

    drivers_meta = {
        int(d["driverNumber"]): d
        for d in (state.get("session_data") or {}).get("drivers", [])
        if d.get("driverNumber") is not None
    }

    driver_nums = [int(dn) for dn in df["driverNumber"].dropna().unique()]
    added = 0
    for drv in driver_nums:
        try:
            docs = _load_raw_telemetry_driver(sk, drv, {"nGear": 1})
            if not docs:
                continue
            counts = [0] * 9  # gears 0..8
            total = 0
            for d in docs:
                for g in d.get("nGear") or []:
                    gi = int(g) if 0 <= int(g) <= 8 else 0
                    counts[gi] += 1
                    total += 1
            if total < 100:
                continue
            data_points = [
                {"gear": str(g), "pct": round(counts[g] / total * 100, 2)}
                for g in range(1, 9)
            ]
            color = _driver_palette(drv, drivers_meta)
            specs.append({
                "type": "bar",
                "title": f"Driver #{drv} — Gear Usage Distribution",
                "sessionKey": sk,
                "xAxis": {"key": "gear", "label": "Gear", "unit": ""},
                "yAxis": {"key": "pct",  "label": "Time in Gear (%)", "unit": "%"},
                "series": [
                    {"id": "pct", "label": "% Frames", "driverNumber": drv,
                     "color": color, "dataKey": "pct", "type": "actual"},
                ],
                "dataPoints": data_points,
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_gear_distribution drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_gear_distribution: {added} specs")
    return {"graph_specs": specs}


def _resolve_teammate(drv: int, drivers_meta: dict[int, dict]) -> int | None:
    meta = drivers_meta.get(drv) or {}
    tid = meta.get("teamId")
    if not tid:
        return None
    for other_dn, other_meta in drivers_meta.items():
        if other_dn != drv and other_meta.get("teamId") == tid:
            return other_dn
    return None


def _resolve_leader(session_data: dict) -> int | None:
    results = session_data.get("sessionResults") or []
    for r in results:
        try:
            pos = r.get("classifiedPosition") or r.get("position")
            if pos is not None and int(pos) == 1:
                return int(r["driverNumber"])
        except (TypeError, ValueError):
            continue
    return None


def _fastest_lap_for(df: pd.DataFrame, dn: int) -> int | None:
    if df is None or df.empty or "driverNumber" not in df.columns:
        return None
    grp = df[df["driverNumber"] == dn]
    if grp.empty or "lapTimeSec" not in grp.columns:
        return None
    representative = grp[grp.get("isRepresentative", True) == True]
    src = representative if not representative.empty else grp
    try:
        idx = src["lapTimeSec"].idxmin()
        return int(src.loc[idx, "lap"])
    except (KeyError, ValueError):
        return None


def generate_driver_lap_trace_overlay(state: TelemetryState) -> TelemetryState:
    """Multi-line speed-vs-distance overlay: focal driver vs teammate vs leader on fastest lap each."""
    df = state.get("laps_df")
    sd = state.get("session_data") or {}
    sk = state["session_key"]
    specs = []

    if df is None or df.empty or "driverNumber" not in df.columns:
        return {"graph_specs": specs}

    drivers_meta = {
        int(d["driverNumber"]): d
        for d in sd.get("drivers", [])
        if d.get("driverNumber") is not None
    }
    leader = _resolve_leader(sd)

    added = 0
    for drv in [int(x) for x in df["driverNumber"].dropna().unique()]:
        try:
            teammate = _resolve_teammate(drv, drivers_meta)
            self_lap = _fastest_lap_for(df, drv)
            if self_lap is None:
                continue
            self_doc = _load_raw_telemetry_lap(sk, drv, self_lap)
            if not self_doc or not self_doc.get("distance"):
                continue
            tm_doc, tm_lap = None, None
            if teammate is not None:
                tm_lap = _fastest_lap_for(df, teammate)
                if tm_lap is not None:
                    tm_doc = _load_raw_telemetry_lap(sk, teammate, tm_lap)
            ld_doc, ld_lap = None, None
            if leader is not None and leader != drv:
                ld_lap = _fastest_lap_for(df, leader)
                if ld_lap is not None:
                    ld_doc = _load_raw_telemetry_lap(sk, leader, ld_lap)

            self_arr = _downsample_arrays({"distance": self_doc.get("distance") or [], "speed": self_doc.get("speed") or []})
            dist = self_arr["distance"]
            if not dist:
                continue

            def _resample_speed(doc: dict | None) -> list[float | None]:
                if not doc or not doc.get("distance") or not doc.get("speed"):
                    return [None] * len(dist)
                src_d = doc["distance"]
                src_s = doc["speed"]
                out: list[float | None] = []
                j = 0
                for x in dist:
                    while j + 1 < len(src_d) and src_d[j + 1] < x:
                        j += 1
                    out.append(round(float(src_s[min(j, len(src_s) - 1)]), 1))
                return out

            tm_speed = _resample_speed(tm_doc) if tm_doc else None
            ld_speed = _resample_speed(ld_doc) if ld_doc else None
            self_speed = [round(float(s), 1) for s in self_arr["speed"]]

            data_points = []
            for i, d in enumerate(dist):
                row: dict = {"distance": round(float(d), 1), "self": self_speed[i] if i < len(self_speed) else None}
                if tm_speed is not None:
                    row["teammate"] = tm_speed[i] if i < len(tm_speed) else None
                if ld_speed is not None:
                    row["leader"] = ld_speed[i] if i < len(ld_speed) else None
                data_points.append(row)

            series = [{"id": "self", "label": f"#{drv} (L{self_lap})",
                       "driverNumber": drv, "color": _driver_palette(drv, drivers_meta),
                       "dataKey": "self", "type": "actual"}]
            if tm_speed is not None:
                series.append({"id": "teammate", "label": f"#{teammate} (L{tm_lap})",
                               "driverNumber": drv, "color": "#888888",
                               "dataKey": "teammate", "type": "reference"})
            if ld_speed is not None:
                series.append({"id": "leader", "label": f"Leader #{leader} (L{ld_lap})",
                               "driverNumber": drv, "color": "#FFD700",
                               "dataKey": "leader", "type": "reference"})

            if len(series) < 2:
                continue

            specs.append({
                "type": "multi_line",
                "title": f"Driver #{drv} — Speed Trace vs Teammate & Leader",
                "sessionKey": sk,
                "xAxis": {"key": "distance", "label": "Distance (m)", "unit": "m"},
                "yAxis": {"key": "speed",    "label": "Speed (km/h)", "unit": "km/h"},
                "series": series,
                "dataPoints": data_points,
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_lap_trace_overlay drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_lap_trace_overlay: {added} specs")
    return {"graph_specs": specs}


def generate_driver_degradation_overlay(state: TelemetryState) -> TelemetryState:
    """Multi-line: driver's clean lap times vs session median + top-3 average per lap."""
    df = state.get("laps_df")
    sk = state["session_key"]
    specs = []
    sd = state.get("session_data") or {}

    if df is None or df.empty:
        return {"graph_specs": specs}
    if not {"driverNumber", "lap", "lapTimeSec"}.issubset(df.columns):
        return {"graph_specs": specs}

    drivers_meta = {
        int(d["driverNumber"]): d
        for d in sd.get("drivers", [])
        if d.get("driverNumber") is not None
    }

    clean = df[df["isRepresentative"]].copy()
    clean["lap"] = clean["lap"].astype(int)
    if clean.empty:
        return {"graph_specs": specs}

    median_by_lap = clean.groupby("lap")["lapTimeSec"].median().to_dict()
    top3_by_lap: dict[int, float] = {}
    for lap_n, grp in clean.groupby("lap"):
        smallest = grp["lapTimeSec"].nsmallest(3)
        if len(smallest) >= 1:
            top3_by_lap[int(lap_n)] = float(smallest.mean())

    added = 0
    for drv in [int(x) for x in clean["driverNumber"].dropna().unique()]:
        try:
            drv_grp = clean[clean["driverNumber"] == drv].sort_values("lap")
            if len(drv_grp) < 5:
                continue
            data_points = []
            for _, row in drv_grp.iterrows():
                lap_n = int(row["lap"])
                data_points.append({
                    "lap":    lap_n,
                    "self":   round(float(row["lapTimeSec"]), 3),
                    "median": round(float(median_by_lap.get(lap_n, float("nan"))), 3) if lap_n in median_by_lap else None,
                    "top3":   round(float(top3_by_lap.get(lap_n, float("nan"))), 3) if lap_n in top3_by_lap else None,
                })
            specs.append({
                "type": "multi_line",
                "title": f"Driver #{drv} — Lap Pace vs Field Median & Top-3 Average",
                "sessionKey": sk,
                "xAxis": {"key": "lap",  "label": "Lap", "unit": ""},
                "yAxis": {"key": "time", "label": "Lap Time (s)", "unit": "s"},
                "series": [
                    {"id": "self",   "label": f"#{drv}",       "driverNumber": drv, "color": _driver_palette(drv, drivers_meta), "dataKey": "self",   "type": "actual"},
                    {"id": "median", "label": "Field Median",  "driverNumber": drv, "color": "#888888",                          "dataKey": "median", "type": "reference"},
                    {"id": "top3",   "label": "Top-3 Average", "driverNumber": drv, "color": "#FFD700",                          "dataKey": "top3",   "type": "reference"},
                ],
                "dataPoints": data_points,
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_degradation_overlay drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_degradation_overlay: {added} specs")
    return {"graph_specs": specs}


def generate_driver_pace_distribution(state: TelemetryState) -> TelemetryState:
    """bar_grouped: driver vs midfield vs leader best/median/worst clean lap times."""
    df = state.get("laps_df")
    sk = state["session_key"]
    specs = []
    sd = state.get("session_data") or {}

    if df is None or df.empty:
        return {"graph_specs": specs}
    if not {"driverNumber", "lapTimeSec"}.issubset(df.columns):
        return {"graph_specs": specs}

    drivers_meta = {
        int(d["driverNumber"]): d
        for d in sd.get("drivers", [])
        if d.get("driverNumber") is not None
    }
    leader = _resolve_leader(sd)

    clean = df[df["isRepresentative"]].copy()
    if clean.empty:
        return {"graph_specs": specs}

    # Rank drivers by best clean lap to define midfield (positions 6-15 by best pace)
    best_by_drv = clean.groupby("driverNumber")["lapTimeSec"].min().sort_values()
    ranking = list(best_by_drv.index.astype(int))
    midfield = ranking[5:15] if len(ranking) >= 6 else ranking[len(ranking) // 2:]

    def _stats(subset: pd.Series) -> tuple[float, float, float] | None:
        s = subset.dropna()
        if s.empty:
            return None
        return (round(float(s.min()), 3), round(float(s.median()), 3), round(float(s.max()), 3))

    midfield_laps = clean[clean["driverNumber"].astype(int).isin(midfield)]["lapTimeSec"]
    mid_stats = _stats(midfield_laps)
    leader_laps = clean[clean["driverNumber"] == leader]["lapTimeSec"] if leader is not None else pd.Series(dtype=float)
    leader_stats = _stats(leader_laps)

    added = 0
    for drv in [int(x) for x in clean["driverNumber"].dropna().unique()]:
        try:
            self_stats = _stats(clean[clean["driverNumber"] == drv]["lapTimeSec"])
            if self_stats is None:
                continue
            data_points = []
            for i, metric in enumerate(("Best", "Median", "Worst")):
                row = {
                    "metric": metric,
                    "self":   self_stats[i],
                }
                if mid_stats is not None:
                    row["midfield"] = mid_stats[i]
                if leader_stats is not None and leader != drv:
                    row["leader"] = leader_stats[i]
                data_points.append(row)
            series = [{"id": "self", "label": f"#{drv}",
                       "driverNumber": drv, "color": _driver_palette(drv, drivers_meta),
                       "dataKey": "self", "type": "actual"}]
            if mid_stats is not None:
                series.append({"id": "midfield", "label": "Midfield",
                               "driverNumber": drv, "color": "#888888",
                               "dataKey": "midfield", "type": "reference"})
            if leader_stats is not None and leader != drv:
                series.append({"id": "leader", "label": f"Leader #{leader}",
                               "driverNumber": drv, "color": "#FFD700",
                               "dataKey": "leader", "type": "reference"})
            if len(series) < 2:
                continue
            specs.append({
                "type": "bar_grouped",
                "title": f"Driver #{drv} — Pace Distribution vs Midfield & Leader",
                "sessionKey": sk,
                "xAxis": {"key": "metric", "label": "Metric", "unit": ""},
                "yAxis": {"key": "time",   "label": "Lap Time (s)", "unit": "s"},
                "series": series,
                "dataPoints": data_points,
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_pace_distribution drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_pace_distribution: {added} specs")
    return {"graph_specs": specs}


def generate_driver_position_progression(state: TelemetryState) -> TelemetryState:
    """Multi-line lap-by-lap race position: focal driver vs teammate. Y-axis inverted in spec hint."""
    df = state.get("laps_df")
    sk = state["session_key"]
    specs = []
    sd = state.get("session_data") or {}

    if df is None or df.empty:
        return {"graph_specs": specs}
    if not {"driverNumber", "lap", "lapTimeSec"}.issubset(df.columns):
        return {"graph_specs": specs}

    drivers_meta = {
        int(d["driverNumber"]): d
        for d in sd.get("drivers", [])
        if d.get("driverNumber") is not None
    }

    # Cumulative race time per (driver, lap) → rank to derive race position
    laps_sorted = df.sort_values(["driverNumber", "lap"]).copy()
    laps_sorted["lap"] = laps_sorted["lap"].astype(int)
    laps_sorted["lapTimeSec"] = pd.to_numeric(laps_sorted["lapTimeSec"], errors="coerce")
    if laps_sorted["lapTimeSec"].isna().all():
        return {"graph_specs": specs}
    laps_sorted["cumTime"] = laps_sorted.groupby("driverNumber")["lapTimeSec"].cumsum()

    position_by_lap_drv: dict[tuple[int, int], int] = {}
    for lap_n, grp in laps_sorted.dropna(subset=["cumTime"]).groupby("lap"):
        ordered = grp.sort_values("cumTime")
        for pos, (_, row) in enumerate(ordered.iterrows(), start=1):
            position_by_lap_drv[(int(lap_n), int(row["driverNumber"]))] = pos

    if not position_by_lap_drv:
        return {"graph_specs": specs}

    added = 0
    for drv in [int(x) for x in laps_sorted["driverNumber"].dropna().unique()]:
        try:
            teammate = _resolve_teammate(drv, drivers_meta)
            laps_for_drv = sorted({lap for (lap, d) in position_by_lap_drv.keys() if d == drv})
            if len(laps_for_drv) < 3:
                continue
            data_points = []
            for lap_n in laps_for_drv:
                row: dict = {"lap": lap_n, "self": position_by_lap_drv.get((lap_n, drv))}
                if teammate is not None:
                    row["teammate"] = position_by_lap_drv.get((lap_n, teammate))
                data_points.append(row)
            series = [{"id": "self", "label": f"#{drv}",
                       "driverNumber": drv, "color": _driver_palette(drv, drivers_meta),
                       "dataKey": "self", "type": "actual"}]
            if teammate is not None:
                series.append({"id": "teammate", "label": f"#{teammate}",
                               "driverNumber": drv, "color": "#888888",
                               "dataKey": "teammate", "type": "reference"})
            if len(series) < 2:
                continue
            specs.append({
                "type": "multi_line",
                "title": f"Driver #{drv} — Track-Order Estimate vs Teammate",
                # This is a cumulative-lap-time ranking, NOT true race position: it
                # ignores grid offset, pit stops, lapped traffic and retirements.
                "subtitle": "Estimated from cumulative lap time (not official classification)",
                "sessionKey": sk,
                "xAxis": {"key": "lap",      "label": "Lap", "unit": ""},
                "yAxis": {"key": "position", "label": "Est. order (lower is better)", "unit": "", "invert": True},
                "series": series,
                "dataPoints": data_points,
                "generatedByAI": True,
            })
            added += 1
        except Exception as e:
            logger.warning("driver_position_progression drv=%s failed: %s", drv, e)

    _update_run_status(state["story_run_id"], "running", f"generate_driver_position_progression: {added} specs")
    return {"graph_specs": specs}


def _build_driver_team_map(state: TelemetryState) -> dict[int, dict]:
    drivers = (state.get("session_data") or {}).get("drivers") or []
    mapping: dict[int, dict] = {}
    for d in drivers:
        dn = d.get("driverNumber")
        if dn is None:
            continue
        mapping[int(dn)] = {
            "teamId":   d.get("teamId"),
            "teamName": d.get("teamName"),
        }
    return mapping


def _infer_graph_scope(spec: dict) -> tuple[int | None, str | None]:
    """Return (driverNumber, teamId) inferred from a graph spec's series.

    Single-driver graphs get the driverNumber tagged. Multi-driver comparison
    graphs return (None, None) → session-wide.
    """
    series = spec.get("series") or []
    driver_numbers = {s.get("driverNumber") for s in series if s.get("driverNumber") is not None}
    if len(driver_numbers) == 1:
        return int(next(iter(driver_numbers))), None
    return None, None


# ── LLM curation node (rank/enrich signals + curate graphs) ───────────────────

_PRIORITY_WEIGHT = {"high": 0, "med": 1, "low": 2}


def _compact_signals_for_llm(signals: list[dict], limit: int) -> list[dict]:
    """Pick the most important signals (by heuristic priority, then |value|) and
    project them to a tiny shape for the prompt — each keeps its ORIGINAL index
    so the LLM's response can be mapped straight back to ``state['signals']``."""
    indexed = list(enumerate(signals))
    indexed.sort(key=lambda iv: (
        _PRIORITY_WEIGHT.get(iv[1].get("priority"), 3),
        -abs(float(iv[1].get("value") or 0) if isinstance(iv[1].get("value"), (int, float)) else 0),
    ))
    out = []
    for i, s in indexed[:limit]:
        out.append({
            "i": i,
            "type": s.get("type"),
            "lap": s.get("lap"),
            "driver": s.get("driverNumber"),
            "priority": s.get("priority"),
            "title": (s.get("title") or "")[:160],
        })
    return out



def detect_dirty_air(state: TelemetryState) -> dict:
    df = state.get("laps_df")
    sk = state["session_key"]
    sd = state.get("session_data") or {}
    tel_aggs_raw = sd.get("lapTelemetryAggregates", [])

    if df is None or df.empty or not tel_aggs_raw:
        return {}

    tel_index = {
        (a["driverNumber"], a["lap"]): a for a in tel_aggs_raw
    }

    new_signals = []
    
    clean = df[df["isRepresentative"]].copy()
    if clean.empty:
        return {}

    for drv, grp in clean.groupby("driverNumber"):
        if len(grp) < 5:
            continue
        
        dirty_laps = []
        clean_laps = []
        for _, row in grp.iterrows():
            lap = int(row.get("lap", 0))
            agg = tel_index.get((drv, lap))
            if not agg:
                continue
            gap = agg.get("minGapToAheadM")
            if gap is not None and gap < 150:
                dirty_laps.append(float(row["lapTimeSec"]))
            elif gap is not None and gap >= 150:
                clean_laps.append(float(row["lapTimeSec"]))
        
        if len(dirty_laps) >= 3 and len(clean_laps) >= 3:
            dirty_med = float(np.median(dirty_laps))
            clean_med = float(np.median(clean_laps))
            delta = dirty_med - clean_med
            
            if delta > 0.5:
                new_signals.append({
                    "sessionKey": sk,
                    "driverNumber": int(drv),
                    "lap": None,
                    "location": "Traffic",
                    "type": "dirty_air_impact",
                    "value": round(delta, 3),
                    "priority": "high" if delta > 1.2 else "med",
                    "title": f"Driver #{drv} losing {delta:.2f}s per lap in dirty air",
                    "meaning": f"Median clean air pace was {clean_med:.2f}s; pace dropped to {dirty_med:.2f}s when following <150m.",
                    "implication": "Traffic severely compromised stint pace, making an undercut or overcut critical.",
                    "aiGenerated": True,
                })

    if new_signals:
        _update_run_status(state["story_run_id"], "running", f"detect_dirty_air: {len(new_signals)} signals")
        return {"signals": new_signals}
    return {}

def detect_start_performance(state: TelemetryState) -> dict:
    sk = state["session_key"]
    sd = state.get("session_data") or {}
    drivers = sd.get("drivers", [])

    new_signals = []

    # Batch-fetch lap-1 telemetry for all drivers in a single query instead of N
    # individual finds (avoids N+1 MongoDB round-trips for a 20-driver grid).
    driver_nums = [int(d["driverNumber"]) for d in drivers if d.get("driverNumber") is not None]
    if not driver_nums:
        return {}

    start_times: dict[int, float] = {}
    lap1_docs = db_client.raw_lap_telemetry().find(
        {"sessionKey": sk, "driverNumber": {"$in": driver_nums}, "lap": 1},
        {"_id": 0, "driverNumber": 1, "sessionTime": 1, "distance": 1},
    )
    for doc in lap1_docs:
        dn = doc.get("driverNumber")
        if dn is None:
            continue
        dn = int(dn)
        dist = doc.get("distance") or []
        times = doc.get("sessionTime") or []
        if not dist or not times or len(dist) != len(times):
            continue

        # sessionTime must be numeric float (seconds). Fast-F1 stores these as
        # total seconds from session start; guard against string/Timedelta leakage.
        try:
            t_start = float(times[0])
        except (TypeError, ValueError):
            continue
        t_200: float | None = None
        for i, d_val in enumerate(dist):
            try:
                if float(d_val) >= 200:
                    t_200 = float(times[i])
                    break
            except (TypeError, ValueError):
                continue
        if t_200 is not None:
            start_times[dn] = t_200 - t_start
    
    if len(start_times) >= 5:
        med_time = float(np.median(list(start_times.values())))
        for dn, t_val in start_times.items():
            delta = t_val - med_time
            if delta < -0.4:  # 0.4s faster to 200m
                new_signals.append({
                    "sessionKey": sk,
                    "driverNumber": dn,
                    "lap": 1,
                    "location": "Start",
                    "type": "exceptional_start",
                    "value": round(delta, 3),
                    "priority": "high",
                    "title": f"Driver #{dn} exceptional launch (0-200m)",
                    "meaning": f"Reached 200m {abs(delta):.2f}s faster than the field median.",
                    "implication": "Crucial positions gained off the line.",
                    "aiGenerated": True,
                })
            elif delta > 0.8:
                new_signals.append({
                    "sessionKey": sk,
                    "driverNumber": dn,
                    "lap": 1,
                    "location": "Start",
                    "type": "poor_start",
                    "value": round(delta, 3),
                    "priority": "med",
                    "title": f"Driver #{dn} bogged down off the line",
                    "meaning": f"Lost {abs(delta):.2f}s compared to field median in the first 200m.",
                    "implication": "Likely dropped positions into Turn 1 due to anti-stall or wheelspin.",
                    "aiGenerated": True,
                })

    if new_signals:
        _update_run_status(state["story_run_id"], "running", f"detect_start_performance: {len(new_signals)} signals")
        return {"signals": new_signals}
    return {}

def detect_ml_anomalies(state: TelemetryState) -> dict:
    df = state.get("laps_df")
    sk = state["session_key"]
    
    if df is None or df.empty:
        return {}
        
    clean = df[df["isRepresentative"]].copy()
    if clean.empty:
        return {}

    new_signals = []
    
    for drv, grp in clean.groupby("driverNumber"):
        times = grp["lapTimeSec"].dropna().values
        if len(times) < 10:
            continue
            
        med = float(np.median(times))
        mad = float(np.median(np.abs(times - med)))
        
        if mad == 0:
            continue
            
        for _, row in grp.iterrows():
            lap_time = float(row["lapTimeSec"])
            z_score = (lap_time - med) / mad
            
            # modified z-score > 4 (using MAD approximation) is an anomaly
            if z_score > 4.5 and (lap_time - med) > 1.0:
                new_signals.append({
                    "sessionKey": sk,
                    "driverNumber": int(drv),
                    "lap": int(row.get("lap", 0)),
                    "location": "Track",
                    "type": "ml_anomaly_slow_lap",
                    "value": round(lap_time - med, 2),
                    "priority": "high" if z_score > 6.0 else "med",
                    "title": f"Driver #{drv} anomalous pace drop (+{lap_time - med:.2f}s)",
                    "meaning": f"Lap time {lap_time:.2f}s deviated significantly from driver's median ({med:.2f}s) (Modified Z-Score: {z_score:.1f}).",
                    "implication": "Machine learning identifies this as a statistically significant anomaly: lock-up, wide moment, or deployment issue.",
                    "aiGenerated": True,
                })

    if new_signals:
        _update_run_status(state["story_run_id"], "running", f"detect_ml_anomalies: {len(new_signals)} signals")
        return {"signals": new_signals}
    return {}

def llm_curate_insights(state: TelemetryState) -> dict:
    """Multi-agent LLM pass over the heuristically-detected signals and generated graphs.

    Uses three passes (Strategist, Race Engineer, Editor) to analyze the signals
    from different perspectives before generating the final headline and summary.
    """
    signals = state.get("signals") or []
    specs = state.get("graph_specs") or []
    team_specs = state.get("team_graph_specs") or []
    if not settings.LANGGRAPH_LLM_ENABLED or not signals:
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    llm = get_llm_optional()
    if llm is None:
        _update_run_status(state["story_run_id"], "running", "llm_curate: LLM disabled")
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    compact_sigs = _compact_signals_for_llm(signals, settings.LANGGRAPH_LLM_TOP_SIGNALS)
    compact_graphs = [
        {"i": i, "type": g.get("type"), "title": (g.get("title") or "")[:120]}
        for i, g in enumerate(specs)
    ][:30]

    import json as _json
    signals_json = _json.dumps(compact_sigs)
    graphs_json = _json.dumps(compact_graphs)

    def _llm_call(prompt: str) -> str:
        """Call the LLM with a plain string prompt.

        CrewAI's LLM.call() accepts either a raw string or a messages list
        depending on version (≥0.100 prefers messages). We normalise to the
        messages format so the call works across versions.
        """
        try:
            return str(llm.call([{"role": "user", "content": prompt}]))
        except Exception:
            # Fallback for older CrewAI versions that accept a bare string.
            return str(llm.call(prompt))

    try:
        strategist_prompt = (
            "You are an F1 Chief Strategist. Review these SIGNALS and focus ONLY on tire degradation, pit stops, undercuts/overcuts, and traffic.\n\n"
            f"SIGNALS:\n{signals_json}\n\n"
            "Return a concise 2-sentence strategic evaluation."
        )
        try:
            strat_eval = _llm_call(strategist_prompt)
        except Exception:
            strat_eval = "Strategy evaluation unavailable."

        engineer_prompt = (
            "You are an F1 Race Engineer. Review these SIGNALS and focus ONLY on raw pace, sector speeds, dirty air, and ML anomalies.\n\n"
            f"SIGNALS:\n{signals_json}\n\n"
            "Return a concise 2-sentence engineering evaluation."
        )
        try:
            eng_eval = _llm_call(engineer_prompt)
        except Exception:
            eng_eval = "Engineering evaluation unavailable."

        editor_prompt = (
            "You are the Editor-in-Chief. You have a strategic evaluation and an engineering evaluation for an F1 session.\n\n"
            f"Strategist:\n{strat_eval}\n\n"
            f"Engineer:\n{eng_eval}\n\n"
            f"Original SIGNALS:\n{signals_json}\n\n"
            f"CHARTS:\n{graphs_json}\n\n"
            "Synthesize these into a cohesive output.\n"
            "Return ONLY a JSON object with this exact shape:\n"
            '{"headline": "<=90 char session headline", '
            '"summary": "2-3 sentence neutral session summary combining strategy and pace", '
            '"ranked_signals": [{"i": <signal index>, "priority": "high|med|low", "insight": "<=160 char sharper implication for this signal"}], '
            '"featured_graphs": [{"i": <chart index>, "caption": "<=120 char caption"}]}\n'
            "Rank the most race-defining signals first. Only include charts that clearly support the story. "
            "No markdown, no code fences, no extra keys."
        )
        raw = _llm_call(editor_prompt)
    except Exception as e:
        logger.warning("llm_curate call failed: %s", e)
        _update_run_status(state["story_run_id"], "running", f"llm_curate: LLM call failed ({e})")
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    parsed = extract_json_object(str(raw))
    if not parsed:
        _update_run_status(state["story_run_id"], "running", "llm_curate: unparseable LLM output")
        return {"final_signals": signals, "final_graph_specs": specs, "final_team_graph_specs": team_specs}

    mutated_signals = [dict(s) for s in signals]
    rank_order = []
    ranked = parsed.get("ranked_signals")
    if isinstance(ranked, list):
        for entry in ranked:
            if not isinstance(entry, dict):
                continue
            i = entry.get("i")
            if not isinstance(i, int) or not (0 <= i < len(mutated_signals)):
                continue
            rank_order.append(i)
            pr = entry.get("priority")
            if pr in ("high", "med", "low"):
                mutated_signals[i]["priority"] = pr
            insight = entry.get("insight")
            if isinstance(insight, str) and insight.strip():
                mutated_signals[i]["implication"] = insight.strip()[:1000]
                mutated_signals[i]["llmCurated"] = True

    if rank_order:
        seen = set(rank_order)
        final_signals = [mutated_signals[i] for i in rank_order] + [s for j, s in enumerate(mutated_signals) if j not in seen]
    else:
        final_signals = mutated_signals

    mutated_specs = [dict(g) for g in specs]
    featured = parsed.get("featured_graphs")
    if isinstance(featured, list):
        for entry in featured:
            if not isinstance(entry, dict):
                continue
            i = entry.get("i")
            cap = entry.get("caption")
            if isinstance(i, int) and 0 <= i < len(mutated_specs) and isinstance(cap, str) and cap.strip():
                mutated_specs[i]["subtitle"] = cap.strip()[:200]
                mutated_specs[i]["llmFeatured"] = True

    headline = str(parsed.get("headline") or "").strip()
    summary = str(parsed.get("summary") or "").strip()
    insight_summary = None
    if headline and summary:
        insight_summary = summary
        final_signals.insert(0, {
            "sessionKey":   state["session_key"],
            "driverNumber": None,
            "lap":          None,
            "location":     "Session",
            "type":         "ai_session_insight",
            "value":        0,
            "priority":     "high",
            "title":        headline[:300],
            "meaning":      summary[:2000],
            "implication":  "LLM-curated session overview grounded in detected signals.",
            "aiGenerated":  True,
            "llmCurated":   True,
        })

    _update_run_status(
        state["story_run_id"], "running",
        f"llm_curate: ranked {len(rank_order)} signals, featured "
        f"{sum(1 for g in mutated_specs if g.get('llmFeatured'))} charts"
    )
    
    return {
        "insight_summary": insight_summary,
        "final_signals": final_signals,
        "final_graph_specs": mutated_specs,
        "final_team_graph_specs": team_specs
    }

_MAX_SIGNALS_PER_TYPE_PER_DRIVER = settings.SIGNAL_MAX_PER_TYPE_PER_DRIVER
_MAX_SIGNALS_TOTAL               = settings.SIGNAL_MAX_TOTAL


def _dedup_and_cap_signals(signals: list[dict]) -> list[dict]:
    """Per-type-per-driver dedup (keep top-N by priority then |value|) followed by a
    global cap. This prevents a 20-driver grid from flooding the DB with 300–500
    signals per run.

    Priority order: high → med → low (then abs value descending).
    The ai_session_insight signal is always kept (it's unique and session-scoped).
    """
    _pw = {"high": 0, "med": 1, "low": 2}

    # Bucket by (driverNumber, type); session-scoped signals (driverNumber=None) are
    # bucketed only by type so they also get deduped.
    from collections import defaultdict
    buckets: dict[tuple, list[dict]] = defaultdict(list)
    for s in signals:
        key = (s.get("driverNumber"), s.get("type"))
        buckets[key].append(s)

    out: list[dict] = []
    for key, group in buckets.items():
        sig_type = key[1]
        # Always keep every ai_session_insight (there should only be one anyway)
        if sig_type == "ai_session_insight":
            out.extend(group)
            continue
        # Sort by priority weight then descending absolute value
        group.sort(key=lambda s: (
            _pw.get(s.get("priority", "low"), 3),
            -abs(float(s.get("value") or 0) if isinstance(s.get("value"), (int, float)) else 0),
        ))
        out.extend(group[:_MAX_SIGNALS_PER_TYPE_PER_DRIVER])

    # Global cap — preserve highest-priority signals
    out.sort(key=lambda s: (
        _pw.get(s.get("priority", "low"), 3),
        -abs(float(s.get("value") or 0) if isinstance(s.get("value"), (int, float)) else 0),
    ))
    return out[:_MAX_SIGNALS_TOTAL]


def persist_results(state: TelemetryState) -> TelemetryState:
    driver_team_map = _build_driver_team_map(state)
    sk = state["session_key"]

    raw_signals = state.get("final_signals") or []
    capped_signals = _dedup_and_cap_signals(raw_signals)
    if len(raw_signals) != len(capped_signals):
        logger.info(
            "persist_results: signal dedup+cap reduced %d → %d for %s",
            len(raw_signals), len(capped_signals), sk,
        )

    # Build signal payloads — tag with team + scope, clamp lengths.
    signal_payloads: list[dict] = []
    for sig in capped_signals:
        dn = sig.get("driverNumber")
        team = driver_team_map.get(int(dn)) if dn is not None else None
        signal_payloads.append(_clamp_signal({
            **sig,
            "teamId":    team["teamId"]   if team else None,
            "teamName":  team["teamName"] if team else None,
            "scopeKind": "driver" if dn is not None else "session",
        }))

    # Build graph payloads — driver/session-scope specs then team specs.
    graph_payloads: list[dict] = []
    for spec in state.get("final_graph_specs", []):
        graph_driver, _ = _infer_graph_scope(spec)
        team = driver_team_map.get(graph_driver) if graph_driver is not None else None
        graph_payloads.append({
            **spec,
            "storyId":      state["story_id"],
            "driverNumber": graph_driver,
            "teamId":       team["teamId"]   if team else None,
            "teamName":     team["teamName"] if team else None,
            "scopeKind":    "driver" if graph_driver is not None else "session",
        })
    for spec in state.get("final_team_graph_specs") or []:
        graph_payloads.append({**spec, "storyId": state["story_id"], "scopeKind": "team"})

    # Idempotent bulk persist — replaceExisting clears prior AI output for this
    # session so re-runs don't accumulate duplicate signals/graphs.
    signal_ids: list[str] = []
    graph_ids: list[str] = []
    try:
        res = backend_post_bulk("/api/signals/bulk", signal_payloads,
                                sessionKey=sk, replaceExisting=True, key="signals")
        signal_ids = res.get("ids", [])
    except Exception as e:
        logger.warning("Bulk signal persist failed: %s", e)
        _update_run_status(state["story_run_id"], "running", f"persist_results: signal bulk FAILED — {e}")
    try:
        res = backend_post_bulk("/api/graphs/bulk", graph_payloads,
                                sessionKey=sk, replaceExisting=True, key="graphs")
        graph_ids = res.get("ids", [])
    except Exception as e:
        logger.warning("Bulk graph persist failed: %s", e)
        _update_run_status(state["story_run_id"], "running", f"persist_results: graph bulk FAILED — {e}")

    try:
        db_client.story_runs().update_one(
            {"_id": ObjectId(state["story_run_id"])},
            {"$set": {
                "status": "running",
                "outputRef.graphIds": graph_ids,
                "outputRef.signalIds": signal_ids,
            }},
        )
    except Exception as e:
        logger.warning("Failed to update story run output refs: %s", e)

    _update_run_status(state["story_run_id"], "running",
                       f"persist_results: {len(graph_ids)} graphs, {len(signal_ids)} signals")
    return state


def abort_run(state: TelemetryState) -> TelemetryState:
    """Terminal node for the no-data case — marks the run failed so a missing or
    empty session surfaces as a failure instead of a silent empty success."""
    err = state.get("fatal_error") or "no analysable data"
    db_client.story_runs().update_one(
        {"_id": ObjectId(state["story_run_id"])},
        {"$set": {"status": "failed", "error": err},
         "$push": {"logs": f"aborted: {err}"}},
    )
    logger.warning("Telemetry run %s aborted: %s", state.get("story_run_id"), err)
    return state


def _route_after_load(state: TelemetryState) -> str:
    return "abort" if state.get("fatal_error") else "continue"


# ── Build the graph ───────────────────────────────────────────────────────────

def build_telemetry_graph():
    workflow = StateGraph(TelemetryState)

    workflow.add_node("load_session", load_session)
    workflow.add_node("abort_run", abort_run)
    workflow.add_node("normalize_laps", normalize_laps)
    workflow.add_node("detect_events", detect_events)
    workflow.add_node("detect_signals", detect_signals)
    workflow.add_node("detect_enriched_signals", detect_enriched_signals)
    
    workflow.add_node("detect_dirty_air", detect_dirty_air)
    workflow.add_node("detect_start_performance", detect_start_performance)
    workflow.add_node("detect_ml_anomalies", detect_ml_anomalies)
    
    workflow.add_node("build_projections", build_projections)
    workflow.add_node("generate_graph_specs", generate_graph_specs)
    workflow.add_node("generate_driver_lap_traces", generate_driver_lap_traces)
    workflow.add_node("generate_driver_stint_degradation", generate_driver_stint_degradation)
    workflow.add_node("generate_driver_sector_comparison", generate_driver_sector_comparison)
    workflow.add_node("generate_driver_lap_trace_overlay", generate_driver_lap_trace_overlay)
    workflow.add_node("generate_driver_degradation_overlay", generate_driver_degradation_overlay)
    workflow.add_node("generate_driver_pace_distribution", generate_driver_pace_distribution)
    workflow.add_node("generate_driver_position_progression", generate_driver_position_progression)
    workflow.add_node("generate_driver_gear_distribution", generate_driver_gear_distribution)
    workflow.add_node("generate_team_graph_specs", generate_team_graph_specs)

    # sync_graphs was a no-op "fan-in" node: LangGraph handles fan-in automatically
    # at the node boundary via the Annotated[list, operator.add] reducers, so the
    # explicit sync node added unnecessary complexity and was removed.

    workflow.add_node("llm_curate_insights", llm_curate_insights)
    workflow.add_node("persist_results", persist_results)

    workflow.set_entry_point("load_session")
    workflow.add_conditional_edges(
        "load_session", _route_after_load,
        {"continue": "normalize_laps", "abort": "abort_run"},
    )
    workflow.add_edge("abort_run", END)
    workflow.add_edge("normalize_laps", "detect_events")
    workflow.add_edge("detect_events", "detect_signals")
    workflow.add_edge("detect_signals", "detect_enriched_signals")
    workflow.add_edge("detect_enriched_signals", "detect_dirty_air")
    workflow.add_edge("detect_dirty_air", "detect_start_performance")
    workflow.add_edge("detect_start_performance", "detect_ml_anomalies")
    workflow.add_edge("detect_ml_anomalies", "build_projections")
    workflow.add_edge("build_projections", "generate_graph_specs")

    # Fan-out: all 9 graph nodes run after generate_graph_specs.
    # Fan-in: all 9 nodes wire directly to llm_curate_insights; LangGraph merges
    # their graph_specs lists via the Annotated[list, operator.add] reducer.
    _graph_nodes = [
        "generate_driver_lap_traces",
        "generate_driver_stint_degradation",
        "generate_driver_sector_comparison",
        "generate_driver_lap_trace_overlay",
        "generate_driver_degradation_overlay",
        "generate_driver_pace_distribution",
        "generate_driver_position_progression",
        "generate_driver_gear_distribution",
        "generate_team_graph_specs",
    ]
    for node in _graph_nodes:
        workflow.add_edge("generate_graph_specs", node)
        workflow.add_edge(node, "llm_curate_insights")

    workflow.add_edge("llm_curate_insights", "persist_results")
    workflow.add_edge("persist_results", END)

    return workflow.compile()


telemetry_graph = build_telemetry_graph()
