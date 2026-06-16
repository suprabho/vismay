"""
POST /ingest/session  — load via Fast-F1, normalize, upsert to MongoDB
GET  /sessions/available  — list available sessions for a year
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone

import pandas as pd
import fastf1
from fastf1.ergast import Ergast
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..utils import db_client  # type: ignore[import]

_cache_dir = os.environ.get("FASTF1_CACHE_DIR", "/tmp/fastf1_cache")
os.makedirs(_cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(_cache_dir)

router = APIRouter()
logger = logging.getLogger(__name__)


class IngestRequest(BaseModel):
    year: int
    gp_name: str        # e.g. "Monaco", "Bahrain", "Abu Dhabi"
    session_type: str   # "R", "Q", "FP1", "FP2", "FP3", "S", "SS", "SQ"


# Fast-F1 session-name → API abbreviation. Keep in sync with frontend SESSION_TYPES.
_SESSION_NAME_TO_ABBR: dict[str, str] = {
    "Race":              "R",
    "Qualifying":        "Q",
    "Sprint":            "S",
    "Sprint Shootout":   "SS",
    "Sprint Qualifying": "SQ",
    "Practice 1":        "FP1",
    "Practice 2":        "FP2",
    "Practice 3":        "FP3",
}


def _slugify(name: str) -> str:
    # Must mirror Backend telemetry.controller.ts: .replace(/[\s-]+/g, '_')
    return re.sub(r"[\s-]+", "_", name.lower())


def _make_session_key(year: int, gp_name: str, session_type: str) -> str:
    return f"{year}_{_slugify(gp_name)}_{session_type}"


def _make_meeting_key(year: int, gp_name: str) -> str:
    return f"{year}_{_slugify(gp_name)}"


def _td_to_seconds(td) -> float | None:
    if pd.isnull(td):
        return None
    if hasattr(td, "total_seconds"):
        return td.total_seconds()
    try:
        return float(td)
    except (TypeError, ValueError):
        return None


def _verify(x_worker_secret: str | None) -> None:
    if settings.AI_WORKER_SECRET and x_worker_secret != settings.AI_WORKER_SECRET:
        raise HTTPException(status_code=403, detail="Invalid worker secret")


_FINISHER_STATUSES = ("finished",)


def _classify_dnf(status: str) -> tuple[bool, str | None]:
    """Return (dnf, dnfReason) given a Fast-F1 Status string.

    Fast-F1 status values include "Finished", "+1 Lap", "+2 Laps" (running classified),
    and DNF reasons like "Accident", "Engine", "Collision", "Power Unit", "Retired".
    """
    s = (status or "").strip()
    if not s:
        return False, None
    sl = s.lower()
    if sl in _FINISHER_STATUSES or sl.startswith("+"):
        return False, None
    return True, s


def _extract_session_results(session) -> list[dict]:
    """Extract per-driver results (grid/finish position, points, Q times) from session.results."""
    try:
        results_df = session.results
        if results_df is None or results_df.empty:
            return []
        out = []
        for _, row in results_df.iterrows():
            dn = int(row["DriverNumber"]) if pd.notna(row.get("DriverNumber")) else 0
            status_str = str(row.get("Status", ""))
            dnf, dnf_reason = _classify_dnf(status_str)
            out.append({
                "driverNumber":       dn,
                "abbreviation":       str(row.get("Abbreviation", "")),
                "gridPosition":       int(row["GridPosition"]) if pd.notna(row.get("GridPosition")) else None,
                "position":           int(row["Position"])     if pd.notna(row.get("Position"))     else None,
                "classifiedPosition": str(row["ClassifiedPosition"]) if pd.notna(row.get("ClassifiedPosition")) else None,
                "points":             float(row["Points"]) if pd.notna(row.get("Points")) else 0.0,
                "status":             status_str,
                "dnf":                dnf,
                "dnfReason":          dnf_reason,
                "timeSec":            _td_to_seconds(row.get("Time")),
                "laps":               int(row["Laps"]) if pd.notna(row.get("Laps")) else None,
                "q1TimeSec":          _td_to_seconds(row.get("Q1")),
                "q2TimeSec":          _td_to_seconds(row.get("Q2")),
                "q3TimeSec":          _td_to_seconds(row.get("Q3")),
                "headshotUrl":        str(row["HeadshotUrl"]) if pd.notna(row.get("HeadshotUrl")) else None,
                "countryCode":        str(row["CountryCode"]) if pd.notna(row.get("CountryCode")) else None,
            })
        return out
    except Exception as exc:
        logger.warning("_extract_session_results failed: %s", exc)
        return []


def _extract_weather(session, laps_df: pd.DataFrame) -> list[dict]:
    """Sample weather data at each lap's start time and return one record per lap."""
    try:
        weather = session.weather_data
        if weather is None or weather.empty or "Time" not in weather.columns:
            return []
        seen_laps: set[int] = set()
        out = []
        for _, row in laps_df.iterrows():
            lap_num = int(row["LapNumber"]) if pd.notna(row.get("LapNumber")) else None
            if lap_num is None or lap_num in seen_laps:
                continue
            lap_start = row.get("LapStartTime")
            if lap_start is None or pd.isnull(lap_start):
                continue
            idx = (weather["Time"] - lap_start).abs().idxmin()
            w = weather.loc[idx]
            out.append({
                "lap":           lap_num,
                "airTemp":       float(w.get("AirTemp",       0) or 0),
                "trackTemp":     float(w.get("TrackTemp",     0) or 0),
                "humidity":      float(w.get("Humidity",      0) or 0),
                "windSpeed":     float(w.get("WindSpeed",     0) or 0),
                "windDirection": float(w.get("WindDirection", 0) or 0),
                "rainfall":      bool(w.get("Rainfall",       False)),
            })
            seen_laps.add(lap_num)
        return out
    except Exception as exc:
        logger.warning("_extract_weather failed: %s", exc)
        return []


def _extract_race_control(session) -> list[dict]:
    """Return all race control messages as plain dicts."""
    try:
        msgs = session.race_control_messages
        if msgs is None or msgs.empty:
            return []
        out = []
        for _, row in msgs.iterrows():
            flag = str(row.get("Flag", "")) or None
            status = str(row.get("Status", "")) or None
            out.append({
                "lap":      int(row["Lap"]) if pd.notna(row.get("Lap")) else None,
                "category": str(row.get("Category", "")),
                "message":  str(row.get("Message",  "")),
                "flag":     flag if flag else None,
                "status":   status if status else None,
            })
        return out
    except Exception as exc:
        logger.warning("_extract_race_control failed: %s", exc)
        return []


def _extract_session_status(session) -> list[dict]:
    """Extract session status timeline (started, SC deployed, red flag, finished, etc.)."""
    try:
        ss = session.session_status
        if ss is None or ss.empty or "Status" not in ss.columns:
            return []
        out = []
        for _, row in ss.iterrows():
            t = _td_to_seconds(row.get("Time"))
            out.append({
                "timeSec": t if t is not None else 0.0,
                "status":  str(row.get("Status", "")),
            })
        return out
    except Exception as exc:
        logger.debug("_extract_session_status failed: %s", exc)
        return []


def _extract_track_status(session) -> list[dict]:
    """Extract track status timeline (1=green, 2=yellow, 4=SC, 5=red, 6=VSC)."""
    try:
        ts = session.track_status
        if ts is None or ts.empty or "Status" not in ts.columns:
            return []
        out = []
        for _, row in ts.iterrows():
            t = _td_to_seconds(row.get("Time"))
            out.append({
                "timeSec": t if t is not None else 0.0,
                "status":  str(row.get("Status", "")),
            })
        return out
    except Exception as exc:
        logger.debug("_extract_track_status failed: %s", exc)
        return []


def _slope_sec_per_lap(lap_times: list[float]) -> float | None:
    """Least-squares slope of lap times vs lap index. Returns None if <3 points."""
    n = len(lap_times)
    if n < 3:
        return None
    mean_x = (n - 1) / 2.0
    mean_y = sum(lap_times) / n
    num = sum((i - mean_x) * (y - mean_y) for i, y in enumerate(lap_times))
    den = sum((i - mean_x) ** 2 for i in range(n))
    if den == 0:
        return None
    return num / den


def _extract_stints(laps_df: pd.DataFrame) -> list[dict]:
    """Build structured stint records with pit timing + tyre degradation slope."""
    if laps_df.empty or "Stint" not in laps_df.columns:
        return []
    out = []
    try:
        for (dn, stint_num, compound), grp in laps_df.groupby(
            ["DriverNumber", "Stint", "Compound"], sort=False
        ):
            grp = grp.sort_values("LapNumber")
            start_lap = int(grp["LapNumber"].min())
            end_lap   = int(grp["LapNumber"].max())
            total     = int(len(grp))

            pit_in_lap = pit_out_lap = pit_delta = None

            if "PitInTime" in grp.columns:
                pit_in_rows = grp[grp["PitInTime"].notna()]
                if not pit_in_rows.empty:
                    pit_in_lap = int(pit_in_rows["LapNumber"].iloc[-1])
                    if "PitOutTime" in grp.columns:
                        last = pit_in_rows.iloc[-1]
                        if pd.notna(last.get("PitOutTime")):
                            delta = (_td_to_seconds(last["PitOutTime"])
                                     or 0) - (_td_to_seconds(last["PitInTime"]) or 0)
                            if delta and delta > 0:
                                pit_delta = round(delta, 2)

            if "PitOutTime" in grp.columns:
                pit_out_rows = grp[grp["PitOutTime"].notna()]
                if not pit_out_rows.empty:
                    pit_out_lap = int(pit_out_rows["LapNumber"].iloc[0])

            # Tyre degradation: slope of clean (non-pit) lap times across the stint
            avg_deg_per_lap: float | None = None
            try:
                clean = grp
                if "PitInTime" in clean.columns:
                    clean = clean[clean["PitInTime"].isna()]
                if "PitOutTime" in clean.columns:
                    clean = clean[clean["PitOutTime"].isna()]
                lap_times = [
                    _td_to_seconds(t) for t in clean["LapTime"]
                ] if "LapTime" in clean.columns else []
                lap_times = [t for t in lap_times if t is not None and t > 0]
                slope = _slope_sec_per_lap(lap_times)
                if slope is not None:
                    avg_deg_per_lap = round(slope, 4)
            except Exception as exc:
                logger.debug("deg calc failed for drv=%s stint=%s: %s", dn, stint_num, exc)

            out.append({
                "driverNumber":     int(dn),
                "stintNumber":      int(stint_num),
                "compound":         str(compound),
                "startLap":         start_lap,
                "endLap":           end_lap,
                "totalLaps":        total,
                "pitInLap":         pit_in_lap,
                "pitOutLap":        pit_out_lap,
                "pitDeltaSec":      pit_delta,
                "averageDegPerLap": avg_deg_per_lap,
            })
    except Exception as exc:
        logger.warning("_extract_stints failed: %s", exc)
    return out


def _fetch_championship_standings(year: int) -> dict[str, dict]:
    """Fetch year-to-date driver standings from Ergast.

    Returns map keyed by Fast-F1 driverId (e.g. "max_verstappen"):
      { driverId: { "position": int, "points": float, "wins": int } }
    Empty dict on any failure — caller must tolerate missing data.
    """
    try:
        resp = Ergast().get_driver_standings(season=year)
        frames = getattr(resp, "content", None) or []
        if not frames:
            return {}
        df = frames[0]
        out: dict[str, dict] = {}
        for _, row in df.iterrows():
            driver_id = row.get("driverId")
            if driver_id is None or (isinstance(driver_id, float) and pd.isna(driver_id)):
                continue
            try:
                position = int(row.get("position")) if pd.notna(row.get("position")) else None
            except (TypeError, ValueError):
                position = None
            try:
                points = float(row.get("points")) if pd.notna(row.get("points")) else None
            except (TypeError, ValueError):
                points = None
            try:
                wins = int(row.get("wins")) if pd.notna(row.get("wins")) else None
            except (TypeError, ValueError):
                wins = None
            out[str(driver_id)] = {
                "position": position,
                "points":   points,
                "wins":     wins,
            }
        return out
    except Exception as exc:
        logger.warning("_fetch_championship_standings(%s) failed: %s", year, exc)
        return {}


def _extract_drivers(session, standings: dict[str, dict] | None = None) -> list[dict]:
    """Extract the full driver roster (incl. DNS / no-lap entries) from session.drivers.

    Each driver dict contains stable identifiers (driverId, teamId) plus display
    fields (names, broadcastName, teamColour, headshotUrl, countryCode). When
    `standings` is provided, championship position/points/wins are attached per
    driver (keyed by driverId). Drivers that raise inside session.get_driver()
    are skipped at debug level.
    """
    standings = standings or {}
    try:
        roster = list(session.drivers) if session.drivers is not None else []
    except Exception as exc:
        logger.warning("session.drivers access failed: %s", exc)
        return []

    out: list[dict] = []
    for dn_raw in roster:
        try:
            info = session.get_driver(dn_raw)
        except Exception as exc:
            logger.debug("get_driver(%s) failed: %s", dn_raw, exc)
            continue

        try:
            dn = int(float(info.get("DriverNumber", dn_raw)))
        except (TypeError, ValueError):
            logger.warning("invalid DriverNumber for %s, skipping driver", dn_raw)
            continue

        colour_raw = str(info.get("TeamColor", "") or "").lstrip("#")
        team_colour = f"#{colour_raw}" if colour_raw else "#ffffff"

        headshot = info.get("HeadshotUrl")
        country  = info.get("CountryCode")

        driver_id = str(info.get("DriverId", ""))
        standing  = standings.get(driver_id) if driver_id else None

        out.append({
            "driverNumber":         dn,
            "abbreviation":         str(info.get("Abbreviation", "")),
            "fullName":             str(info.get("FullName", "")),
            "firstName":            str(info.get("FirstName", "")),
            "lastName":             str(info.get("LastName", "")),
            "broadcastName":        str(info.get("BroadcastName", "")),
            "driverId":             driver_id,
            "teamName":             str(info.get("TeamName", "")),
            "teamId":               str(info.get("TeamId", "")),
            "teamColour":           team_colour,
            "headshotUrl":          str(headshot) if headshot else None,
            "countryCode":          str(country)  if country  else None,
            "championshipPosition": standing.get("position") if standing else None,
            "championshipPoints":   standing.get("points")   if standing else None,
            "championshipWins":     standing.get("wins")     if standing else None,
        })
    return out


def _upsert_drivers(year: int, drivers: list[dict]) -> None:
    """Mirror per-session drivers into the year-scoped drivers collection.

    Key: (year, driverNumber). Per-driver failures log a warning and continue —
    must not abort Phase 1 ingestion.
    """
    if not drivers:
        return
    now = datetime.now(tz=timezone.utc)
    try:
        coll = db_client.drivers()
        coll.create_index(
            [("year", 1), ("driverNumber", 1)],
            unique=True,
            name="year_driverNumber_unique",
        )
    except Exception as exc:
        logger.warning("_upsert_drivers: collection/index setup failed year=%s: %s", year, exc)
        return
    for d in drivers:
        try:
            doc = dict(d)
            doc["year"] = year
            doc["updatedAt"] = now
            coll.update_one(
                {"year": year, "driverNumber": d["driverNumber"]},
                {"$set": doc},
                upsert=True,
            )
        except Exception as exc:
            logger.warning(
                "_upsert_drivers: failed for driver=%s year=%s: %s",
                d.get("driverNumber"), year, exc,
            )


# ── Phase 2 helpers: raw telemetry storage and aggregate computation ──────────

def _aggregate_from_arrays(
    session_time_sec: list,
    speed: list[float],
    throttle: list[float],
    brake: list[int],
    drs: list[int],
    n_gear: list[int],
    distance: list[float],
    dist_to_ahead: list[float],
    lap_start_sec: float | None,
    s1_end_sec: float | None,
    s2_end_sec: float | None,
    rpm: list[float] | None = None,
    z: list[float] | None = None,
) -> dict:
    """Compute per-lap aggregate stats from parallel telemetry arrays (no pandas needed)."""
    n = len(speed)
    avg_speed = sum(speed) / n if n else 0.0
    max_speed = max(speed, default=0.0)
    avg_thr   = sum(throttle) / n if n else 0.0

    braking = sum(
        1 for i in range(1, len(brake)) if not brake[i - 1] and brake[i]
    )
    drs_acts = sum(
        1 for i in range(1, len(drs))
        if drs[i - 1] not in (10, 12) and drs[i] in (10, 12)
    )
    top_gear = max(n_gear, default=0)
    lap_dist = max(distance, default=0.0)

    valid_gap = [g for g in dist_to_ahead if g >= 0]
    avg_gap = sum(valid_gap) / len(valid_gap) if valid_gap else 0.0
    min_gap = min(valid_gap, default=0.0)

    s1_max = s2_max = s3_max = 0.0
    for t, s in zip(session_time_sec, speed):
        if t is None:
            continue
        if lap_start_sec is not None and s1_end_sec is not None and lap_start_sec <= t <= s1_end_sec:
            s1_max = max(s1_max, s)
        elif s1_end_sec is not None and s2_end_sec is not None and s1_end_sec < t <= s2_end_sec:
            s2_max = max(s2_max, s)
        elif s2_end_sec is not None and t > s2_end_sec:
            s3_max = max(s3_max, s)

    rpm_vals = [r for r in (rpm or []) if r is not None and r == r and r > 0]
    max_rpm = int(max(rpm_vals)) if rpm_vals else 0
    avg_rpm = int(sum(rpm_vals) / len(rpm_vals)) if rpm_vals else 0

    z_vals = [v for v in (z or []) if v is not None and v == v]
    elevation_gain_m = round(max(z_vals) - min(z_vals), 1) if z_vals else 0.0

    return {
        "avgSpeed":        round(avg_speed, 2),
        "maxSpeed":        round(max_speed, 2),
        "avgThrottlePct":  round(avg_thr,   2),
        "brakingEvents":   braking,
        "drsActivations":  drs_acts,
        "topGear":         top_gear,
        "lapDistanceM":    round(lap_dist, 1),
        "sector1MaxSpeed": round(s1_max, 2),
        "sector2MaxSpeed": round(s2_max, 2),
        "sector3MaxSpeed": round(s3_max, 2),
        "avgGapToAheadM":  round(avg_gap, 1),
        "minGapToAheadM":  round(min_gap, 1),
        "maxRpm":          max_rpm,
        "avgRpm":          avg_rpm,
        "elevationGainM":  elevation_gain_m,
    }


def _upsert_raw_lap_telemetry(session_key: str, session) -> int:
    """Persist raw per-frame telemetry to raw_lap_telemetry (one doc per driver×lap).

    Failure of any individual doc must not abort Phase 2 — wrapped in try/except
    following the _upsert_drivers pattern.
    """
    coll = db_client.raw_lap_telemetry()
    try:
        coll.create_index(
            [("sessionKey", 1), ("driverNumber", 1), ("lap", 1)],
            unique=True,
            name="sessionKey_driver_lap_unique",
        )
    except Exception as exc:
        logger.warning("raw_lap_telemetry: index setup failed: %s", exc)

    now   = datetime.now(tz=timezone.utc)
    count = 0
    for _, lap in session.laps.iterlaps():
        lap_num = int(lap["LapNumber"])  if pd.notna(lap.get("LapNumber"))  else None
        drv_num = int(lap["DriverNumber"]) if pd.notna(lap.get("DriverNumber")) else None
        if lap_num is None or drv_num is None:
            continue
        try:
            # interpolate_edges=True fills lap-boundary gaps; documented Fast-F1 fix
            # for missing values at lap start/end.
            tel = lap.get_telemetry()
            if tel is None or tel.empty:
                continue
            tel = tel.add_distance()
            tel = tel.add_driver_ahead()

            def _col(name, default):
                return tel[name].fillna(default).tolist() if name in tel.columns else []

            st = [_td_to_seconds(v) for v in tel["SessionTime"]] if "SessionTime" in tel.columns else []
            coll.update_one(
                {"sessionKey": session_key, "driverNumber": drv_num, "lap": lap_num},
                {"$set": {
                    "sessionKey":            session_key,
                    "driverNumber":          drv_num,
                    "lap":                   lap_num,
                    "frameCount":            len(st),
                    "sessionTime":           st,
                    "speed":                 _col("Speed",                 0.0),
                    "throttle":              _col("Throttle",              0.0),
                    "brake":                 [int(b) for b in _col("Brake", False)],
                    "drs":                   [int(d) for d in _col("DRS",   0)],
                    "nGear":                 [int(g) for g in _col("nGear", 0)],
                    "rpm":                   [int(r) for r in _col("RPM",   0)],
                    "z":                     _col("Z",                     0.0),
                    "distance":              _col("Distance",              0.0),
                    "distanceToAhead":       [g if g == g else -1.0 for g in
                                              (tel["DistanceToDriverAhead"].tolist()
                                               if "DistanceToDriverAhead" in tel.columns else [])],
                    "lapStartTimeSec":       _td_to_seconds(lap.get("LapStartTime")),
                    "sector1SessionTimeSec": _td_to_seconds(lap.get("Sector1SessionTime")),
                    "sector2SessionTimeSec": _td_to_seconds(lap.get("Sector2SessionTime")),
                    "updatedAt":             now,
                }},
                upsert=True,
            )
            count += 1
        except Exception as exc:
            logger.debug("raw_tel skip drv=%s lap=%s: %s", drv_num, lap_num, exc)
    return count


def _compute_aggregates_from_mongo(session_key: str) -> list[dict]:
    """Read raw_lap_telemetry docs and recompute lap aggregates without Fast-F1."""
    docs = list(db_client.raw_lap_telemetry().find(
        {"sessionKey": session_key},
        {"driverNumber": 1, "lap": 1, "sessionTime": 1, "speed": 1, "throttle": 1,
         "brake": 1, "drs": 1, "nGear": 1, "rpm": 1, "z": 1,
         "distance": 1, "distanceToAhead": 1,
         "lapStartTimeSec": 1, "sector1SessionTimeSec": 1, "sector2SessionTimeSec": 1},
    ))
    aggregates: list[dict] = []
    for doc in docs:
        try:
            agg = _aggregate_from_arrays(
                session_time_sec=doc.get("sessionTime", []),
                speed=doc.get("speed", []),
                throttle=doc.get("throttle", []),
                brake=doc.get("brake", []),
                drs=doc.get("drs", []),
                n_gear=doc.get("nGear", []),
                distance=doc.get("distance", []),
                dist_to_ahead=doc.get("distanceToAhead", []),
                lap_start_sec=doc.get("lapStartTimeSec"),
                s1_end_sec=doc.get("sector1SessionTimeSec"),
                s2_end_sec=doc.get("sector2SessionTimeSec"),
                rpm=doc.get("rpm", []),
                z=doc.get("z", []),
            )
            agg["driverNumber"] = doc["driverNumber"]
            agg["lap"]          = doc["lap"]
            aggregates.append(agg)
        except Exception as exc:
            logger.debug("aggregate_from_mongo skip drv=%s lap=%s: %s",
                         doc.get("driverNumber"), doc.get("lap"), exc)
    return aggregates


# ── Phase 3: car positions (X/Y over time) for track replay ──────────────────

# Fast-F1 pos_data native rate is ~3-5 Hz. Downsample to a fixed rate so all
# drivers share a comparable time index and the Race page can replay smoothly.
_POS_SAMPLE_RATE_HZ = 4
_POS_SAMPLE_PERIOD_MS = int(1000 / _POS_SAMPLE_RATE_HZ)


def _circuit_key(gp_name: str) -> str:
    return _slugify(gp_name)


def _nearest_time_index(times: list[float], target: float) -> int | None:
    """Linear scan for the index whose time is closest to `target` seconds.
    Skips NaN entries; returns None if no valid time exists."""
    best_i = None
    best_d = float("inf")
    for i, t in enumerate(times):
        if t != t:  # NaN check
            continue
        d = abs(t - target)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


def _upsert_circuit(session, year: int, gp_name: str) -> str:
    """Extract circuit geometry once per (gp, year) and upsert to circuits collection.

    Stores corner coordinates + a downsampled track outline (X/Y polyline) derived
    from the fastest lap's position data. Race page uses this to render the track.
    """
    circuit_key = _circuit_key(gp_name)
    try:
        info = session.get_circuit_info()
    except Exception as exc:
        logger.debug("get_circuit_info failed for %s: %s", circuit_key, exc)
        info = None

    corners: list[dict] = []
    rotation_deg = 0.0
    if info is not None:
        try:
            for _, row in info.corners.iterrows():
                corners.append({
                    "number": int(row["Number"]) if pd.notna(row.get("Number")) else 0,
                    "letter": str(row.get("Letter", "")),
                    "x":      float(row["X"]) if pd.notna(row.get("X")) else 0.0,
                    "y":      float(row["Y"]) if pd.notna(row.get("Y")) else 0.0,
                    "angle":  float(row["Angle"]) if pd.notna(row.get("Angle")) else 0.0,
                    "distance": float(row["Distance"]) if pd.notna(row.get("Distance")) else 0.0,
                })
            rotation_deg = float(getattr(info, "rotation", 0.0) or 0.0)
        except Exception as exc:
            logger.debug("corner extract failed: %s", exc)

    # Track outline: sample fastest lap pos_data to get a closed polyline
    outline_x: list[float] = []
    outline_y: list[float] = []
    outline_z: list[float] = []  # elevation (Fast-F1 1/10 m) — optional, drives the 3D ribbon
    outline_t: list[float] = []  # SessionTime (sec) at each sample — used for sector boundaries
    sector_boundaries: dict | None = None
    s1_end = s2_end = None
    try:
        fastest_lap = session.laps.pick_fastest()
        pos = fastest_lap.get_pos_data() if fastest_lap is not None else None
        if pos is not None and not pos.empty and {"X", "Y"}.issubset(pos.columns):
            # Sample every 10th point for the outline; keeps doc small (~200-400 points)
            step = max(1, len(pos) // 400)
            has_st = "SessionTime" in pos.columns
            has_z  = "Z" in pos.columns
            for i in range(0, len(pos), step):
                x = pos["X"].iloc[i]
                y = pos["Y"].iloc[i]
                if pd.isnull(x) or pd.isnull(y):
                    continue
                outline_x.append(float(x))
                outline_y.append(float(y))
                if has_z:
                    z = pos["Z"].iloc[i]
                    outline_z.append(float(z) if pd.notna(z) else float("nan"))
                if has_st:
                    st = _td_to_seconds(pos["SessionTime"].iloc[i])
                    outline_t.append(st if st is not None else float("nan"))

            # Sector boundary indices: find the outline samples nearest to the
            # SessionTime at which sectors 1 and 2 ended on the fastest lap.
            if has_st and outline_t and fastest_lap is not None:
                s1_end = _td_to_seconds(fastest_lap.get("Sector1SessionTime"))
                s2_end = _td_to_seconds(fastest_lap.get("Sector2SessionTime"))
                if s1_end is not None and s2_end is not None:
                    idx1 = _nearest_time_index(outline_t, s1_end)
                    idx2 = _nearest_time_index(outline_t, s2_end)
                    if idx1 is not None and idx2 is not None and 0 < idx1 < idx2 < len(outline_x) - 1:
                        sector_boundaries = {"index1": idx1, "index2": idx2}
    except Exception as exc:
        logger.debug("track outline extract failed for %s: %s", circuit_key, exc)

    # Smooth GPS elevation (raw Z is noisy by several metres) with a small centered
    # rolling mean — the 3D race-view ribbon is built from this outline. Drop z
    # entirely if the source had no usable Z column (older/2D sessions stay flat).
    if outline_z and any(pd.notna(v) for v in outline_z):
        smoothed = pd.Series(outline_z).rolling(window=7, center=True, min_periods=1).mean()
        outline_z = [round(float(v), 1) if pd.notna(v) else 0.0 for v in smoothed]
    else:
        outline_z = []

    outline_doc: dict = {"x": outline_x, "y": outline_y}
    if outline_z:
        outline_doc["z"] = outline_z

    bounds = None
    if outline_x and outline_y:
        bounds = {
            "minX": min(outline_x), "maxX": max(outline_x),
            "minY": min(outline_y), "maxY": max(outline_y),
        }

    db_client.circuits().update_one(
        {"circuitKey": circuit_key, "year": year},
        {"$set": {
            "circuitKey":       circuit_key,
            "year":             year,
            "gpName":           gp_name,
            "circuitName":      str(session.event.get("Location", "")),
            "country":          str(session.event.get("Country", "")),
            "rotationDeg":      rotation_deg,
            "corners":          corners,
            "outline":          outline_doc,
            "bounds":           bounds,
            "sectorBoundaries": sector_boundaries,
            "updatedAt":        datetime.now(tz=timezone.utc),
        }},
        upsert=True,
    )
    logger.info(
        "Circuit upserted: %s/%s (%d corners, %d outline pts, z=%s, sectorBoundaries=%s)",
        circuit_key, year, len(corners), len(outline_x), bool(outline_z), sector_boundaries,
    )
    return circuit_key


def _enrich_positions(session_key: str, year: int, gp_name: str, session_type: str) -> None:
    """Phase 3: load per-driver X/Y position data, downsample, upsert to car_positions.

    One document per (sessionKey, driverNumber). Frames are stored as flat parallel
    arrays for compact BSON and fast streaming. Sample rate is _POS_SAMPLE_RATE_HZ.
    """
    logger.info("Phase 3 start: position enrichment for %s", session_key)

    # Skip only if positions are already complete *and include elevation*. The
    # skip is keyed on z presence (not just doc count) so the retry-positions
    # endpoint doubles as the z-backfill path: existing 2D-only sessions are
    # re-processed once to gain elevation, then converge on subsequent runs.
    circuit_key_check = _circuit_key(gp_name)
    existing_drivers = db_client.car_positions().count_documents({"sessionKey": session_key})
    circuit_doc      = db_client.circuits().find_one(
        {"circuitKey": circuit_key_check, "year": year}, projection={"outline.z": 1}
    )
    circuit_has_z    = bool(circuit_doc and circuit_doc.get("outline", {}).get("z"))
    positions_have_z = db_client.car_positions().count_documents(
        {"sessionKey": session_key, "frames.z.0": {"$exists": True}}
    ) > 0
    if existing_drivers > 0 and circuit_doc is not None and circuit_has_z and positions_have_z:
        logger.info(
            "Phase 3 skip for %s: %d driver positions (with z) + circuit already in MongoDB",
            session_key, existing_drivers,
        )
        db_client.telemetry_sessions().update_one(
            {"sessionKey": session_key},
            {"$set": {"positionsStatus": "done", "positionsError": None}},
        )
        return

    db_client.telemetry_sessions().update_one(
        {"sessionKey": session_key},
        {"$set": {"positionsStatus": "processing", "positionsError": None}},
    )

    try:
        session = fastf1.get_session(year, gp_name, session_type)
        # pos_data is loaded with telemetry=True; reuses Phase 2 cache if warm
        session.load(laps=True, telemetry=True, weather=False, messages=False)

        circuit_key = _upsert_circuit(session, year, gp_name)

        laps = session.laps
        # Group laps by driver; concatenate pos_data across all driver laps to
        # build a continuous timeline.
        driver_numbers = laps["DriverNumber"].dropna().unique() if not laps.empty else []
        upserted = 0

        for dn_raw in driver_numbers:
            try:
                dn = int(dn_raw)
            except (TypeError, ValueError):
                continue

            try:
                driver_laps = laps[laps["DriverNumber"] == dn_raw]
                if driver_laps.empty:
                    continue

                # Collect pos_data per lap (Fast-F1 returns one slice per lap)
                frames_t:   list[int]   = []
                frames_x:   list[float] = []
                frames_y:   list[float] = []
                frames_z:   list[float] = []  # elevation; client smooths per-frame Z
                frames_lap: list[int]   = []
                frames_status: list[int] = []

                last_sample_ms = -_POS_SAMPLE_PERIOD_MS

                for _, lap_row in driver_laps.iterrows():
                    try:
                        lap_num = int(lap_row["LapNumber"]) if pd.notna(lap_row.get("LapNumber")) else 0
                        pos = lap_row.get_pos_data() if hasattr(lap_row, "get_pos_data") else None
                        if pos is None or pos.empty or "SessionTime" not in pos.columns:
                            continue
                        if not {"X", "Y"}.issubset(pos.columns):
                            continue

                        for _, p in pos.iterrows():
                            st = p.get("SessionTime")
                            if pd.isnull(st):
                                continue
                            t_ms = int(_td_to_seconds(st) * 1000) if _td_to_seconds(st) is not None else None
                            if t_ms is None:
                                continue
                            # Downsample: keep one frame per period
                            if t_ms - last_sample_ms < _POS_SAMPLE_PERIOD_MS:
                                continue

                            x = p.get("X"); y = p.get("Y")
                            if pd.isnull(x) or pd.isnull(y):
                                continue
                            z = p.get("Z")

                            status_raw = str(p.get("Status", "OnTrack"))
                            # Encode: 0=OnTrack, 1=OffTrack, 2=InPit
                            status_code = 0
                            if status_raw == "OffTrack":
                                status_code = 1
                            elif status_raw == "InPit":
                                status_code = 2

                            frames_t.append(t_ms)
                            frames_x.append(round(float(x), 1))
                            frames_y.append(round(float(y), 1))
                            frames_z.append(round(float(z), 1) if pd.notna(z) else 0.0)
                            frames_lap.append(lap_num)
                            frames_status.append(status_code)
                            last_sample_ms = t_ms
                    except Exception as lap_exc:
                        logger.debug("pos skip drv=%s lap=%s: %s", dn, lap_row.get("LapNumber"), lap_exc)
                        continue

                if not frames_t:
                    continue

                db_client.car_positions().update_one(
                    {"sessionKey": session_key, "driverNumber": dn},
                    {"$set": {
                        "sessionKey":    session_key,
                        "circuitKey":    circuit_key,
                        "driverNumber":  dn,
                        "sampleRateHz":  _POS_SAMPLE_RATE_HZ,
                        "frameCount":    len(frames_t),
                        "t0Ms":          frames_t[0],
                        "tEndMs":        frames_t[-1],
                        "frames": {
                            "t":      frames_t,
                            "x":      frames_x,
                            "y":      frames_y,
                            "z":      frames_z,
                            "lap":    frames_lap,
                            "status": frames_status,
                        },
                        "updatedAt":     datetime.now(tz=timezone.utc),
                    }},
                    upsert=True,
                )
                upserted += 1
            except Exception as drv_exc:
                logger.debug("pos drv=%s failed: %s", dn, drv_exc)
                continue

        db_client.telemetry_sessions().update_one(
            {"sessionKey": session_key},
            {"$set": {
                "circuitKey":      circuit_key,
                "positionsStatus": "done",
                "positionsError":  None,
            }},
        )
        logger.info("Phase 3 done for %s: %d drivers with positions", session_key, upserted)

    except Exception as exc:
        logger.error("Phase 3 failed for %s: %s", session_key, exc)
        db_client.telemetry_sessions().update_one(
            {"sessionKey": session_key},
            {"$set": {
                "positionsStatus": "failed",
                "positionsError":  str(exc)[:2000],
            }},
        )


def _enrich_telemetry(session_key: str, year: int, gp_name: str, session_type: str) -> None:
    """Phase 2: compute per-lap telemetry aggregates, patch MongoDB.

    Cache-hit path: if raw_lap_telemetry already exists for this session, reads from
    MongoDB and skips Fast-F1 entirely — making retry stateless (no file cache needed).
    Cache-miss path: loads Fast-F1, writes raw frames to raw_lap_telemetry, then computes.
    """
    logger.info("Phase 2 start: telemetry enrichment for %s", session_key)

    db_client.telemetry_sessions().update_one(
        {"sessionKey": session_key},
        {"$set": {"telemetryStatus": "processing", "telemetryError": None}},
    )

    try:
        raw_count = db_client.raw_lap_telemetry().count_documents(
            {"sessionKey": session_key}, limit=1
        )
        if raw_count > 0:
            logger.info("Phase 2 cache-hit: reading raw telemetry from MongoDB for %s", session_key)
            aggregates = _compute_aggregates_from_mongo(session_key)
        else:
            logger.info("Phase 2 cache-miss: loading telemetry from Fast-F1 for %s", session_key)
            session = fastf1.get_session(year, gp_name, session_type)
            session.load(laps=True, telemetry=True, weather=False, messages=False)

            raw_written = _upsert_raw_lap_telemetry(session_key, session)
            logger.info("Phase 2: wrote %d raw telemetry docs for %s", raw_written, session_key)

            aggregates = _compute_aggregates_from_mongo(session_key)

        db_client.telemetry_sessions().update_one(
            {"sessionKey": session_key},
            {"$set": {
                "lapTelemetryAggregates": aggregates,
                "telemetryStatus":        "done",
                "telemetryError":         None,
            }},
        )
        logger.info("Phase 2 done for %s: %d lap aggregates", session_key, len(aggregates))

    except Exception as exc:
        logger.error("Phase 2 failed for %s: %s", session_key, exc)
        db_client.telemetry_sessions().update_one(
            {"sessionKey": session_key},
            {"$set": {
                "telemetryStatus": "failed",
                "telemetryError":  str(exc)[:2000],
            }},
        )


@router.post("/ingest/session")
def ingest_session(
    req: IngestRequest,
    background_tasks: BackgroundTasks,
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    """Load session via Fast-F1, normalize, upsert to MongoDB telemetry_sessions."""
    _verify(x_worker_secret)

    session_key = _make_session_key(req.year, req.gp_name, req.session_type)
    meeting_key = _make_meeting_key(req.year, req.gp_name)

    logger.info("Loading Fast-F1 session: %s", session_key)

    try:
        session = fastf1.get_session(req.year, req.gp_name, req.session_type)
        session.load(laps=True, telemetry=False, weather=True, messages=True)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Fast-F1 load failed: {exc}") from exc

    laps_df = session.laps

    session_results      = _extract_session_results(session)
    weather_data         = _extract_weather(session, laps_df)
    race_control_msgs    = _extract_race_control(session)
    session_status       = _extract_session_status(session)
    track_status         = _extract_track_status(session)
    stints               = _extract_stints(laps_df)

    # ── Drivers (full roster, incl. DNS) ─────────────────────────────────────
    standings = _fetch_championship_standings(req.year)
    drivers   = _extract_drivers(session, standings)
    _upsert_drivers(req.year, drivers)

    # ── Stint lookup: "driverNum:lap" → {compound, stintLap, tyreLife, freshTyre} ─
    stint_map: dict[str, dict] = {}
    if not laps_df.empty and "Stint" in laps_df.columns:
        for _, row in laps_df.iterrows():
            dn = str(int(row["DriverNumber"])) if pd.notna(row.get("DriverNumber")) else None
            lap_num = int(row["LapNumber"]) if pd.notna(row.get("LapNumber")) else None
            if dn and lap_num:
                tyre_life = int(row["TyreLife"]) if pd.notna(row.get("TyreLife")) else 0
                stint_map[f"{dn}:{lap_num}"] = {
                    "compound":  str(row.get("Compound", "UNKNOWN")),
                    "stintLap":  tyre_life,
                    "tyreLife":  tyre_life,
                    "freshTyre": bool(row.get("FreshTyre", False)) if pd.notna(row.get("FreshTyre")) else False,
                }

    # ── Pit laps set ─────────────────────────────────────────────────────────
    pit_laps: set[str] = set()
    if not laps_df.empty and "PitInTime" in laps_df.columns:
        for _, row in laps_df[laps_df["PitInTime"].notna()].iterrows():
            dn = str(int(row["DriverNumber"])) if pd.notna(row.get("DriverNumber")) else None
            lap_num = int(row["LapNumber"]) if pd.notna(row.get("LapNumber")) else None
            if dn and lap_num:
                pit_laps.add(f"{dn}:{lap_num}")

    # ── SC laps set ───────────────────────────────────────────────────────────
    sc_laps: set[int] = set()
    try:
        msgs = session.race_control_messages
        if msgs is not None and not msgs.empty and "Category" in msgs.columns:
            sc_rows = msgs[msgs["Category"].str.lower().str.contains("safety", na=False)]
            for _, row in sc_rows.iterrows():
                if pd.notna(row.get("Lap")):
                    sc_laps.add(int(row["Lap"]))
    except Exception as exc:
        logger.debug("SC lap extraction failed: %s", exc)

    # ── Best lap per driver ───────────────────────────────────────────────────
    best_by_driver: dict[int, float] = {}
    if not laps_df.empty:
        for _, row in laps_df.iterrows():
            dn = int(row["DriverNumber"]) if pd.notna(row.get("DriverNumber")) else 0
            lap_time = _td_to_seconds(row.get("LapTime"))
            if lap_time and (dn not in best_by_driver or lap_time < best_by_driver[dn]):
                best_by_driver[dn] = lap_time

    # ── Processed laps (keeps incomplete / out-laps with lapTimeSec=None) ────
    processed_laps = []
    if not laps_df.empty:
        for _, row in laps_df.iterrows():
            dn      = int(row["DriverNumber"]) if pd.notna(row.get("DriverNumber")) else 0
            lap_num = int(row["LapNumber"])    if pd.notna(row.get("LapNumber"))    else 0
            if dn == 0 or lap_num == 0:
                continue  # skip rows missing identity; keep incomplete laps

            lap_time = _td_to_seconds(row.get("LapTime"))   # may be None
            s1 = _td_to_seconds(row.get("Sector1Time"))     # may be None
            s2 = _td_to_seconds(row.get("Sector2Time"))
            s3 = _td_to_seconds(row.get("Sector3Time"))
            stint_info = stint_map.get(
                f"{dn}:{lap_num}",
                {"compound": "UNKNOWN", "stintLap": 0, "tyreLife": 0, "freshTyre": False},
            )

            events: list[str] = []
            if lap_time is None:
                events.append("incomplete")
            if f"{dn}:{lap_num}" in pit_laps:
                events.append("pit_in")
            if lap_num in sc_laps:
                events.append("sc_deployed")
            if lap_time and best_by_driver.get(dn) == lap_time and lap_time > 0:
                events.append("personal_best")

            processed_laps.append({
                "driverNumber": dn,
                "lap":          lap_num,
                "lapTimeSec":   round(lap_time, 4) if lap_time else None,
                "sectors":      [
                    round(s1, 4) if s1 else None,
                    round(s2, 4) if s2 else None,
                    round(s3, 4) if s3 else None,
                ],
                "compound":     stint_info["compound"],
                "stintLap":     stint_info["stintLap"],
                "tyreLife":     stint_info.get("tyreLife", stint_info["stintLap"]),
                "freshTyre":    stint_info.get("freshTyre", False),
                "events":       events,
                "position":     int(row["Position"]) if pd.notna(row.get("Position")) else None,
            })

    # ── Session metadata ──────────────────────────────────────────────────────
    event = session.event
    circuit_name = str(event.get("Location", event.get("OfficialEventName", "")))
    country = str(event.get("Country", ""))
    event_date = event.get("EventDate")
    date_start = pd.Timestamp(event_date).to_pydatetime() if event_date is not None else None

    # ── Upsert ────────────────────────────────────────────────────────────────
    db_client.telemetry_sessions().update_one(
        {"sessionKey": session_key},
        {"$set": {
            "sessionKey":    session_key,
            "sessionName":   req.session_type,
            "circuitName":   circuit_name,
            "country":       country,
            "year":          req.year,
            "meetingKey":    meeting_key,
            "dateStart":     date_start,
            "ingestedAt":    datetime.now(tz=timezone.utc),
            "drivers":             drivers,
            "processedLaps":       processed_laps,
            "sessionResults":      session_results,
            "weatherData":         weather_data,
            "raceControlMessages": race_control_msgs,
            "sessionStatus":       session_status,
            "trackStatus":         track_status,
            "stints":              stints,
            "telemetryStatus":     "pending",
            "positionsStatus":     "pending",
            "circuitKey":          _circuit_key(req.gp_name),
        }},
        upsert=True,
    )

    logger.info(
        "Ingested %s: %d drivers, %d laps",
        session_key, len(drivers), len(processed_laps),
    )
    background_tasks.add_task(
        _enrich_telemetry, session_key, req.year, req.gp_name, req.session_type
    )
    background_tasks.add_task(
        _enrich_positions, session_key, req.year, req.gp_name, req.session_type
    )
    return {
        "sessionKey": session_key,
        "status":     "ingested",
        "lapsCount":  len(processed_laps),
        "drivers":    len(drivers),
    }


@router.post("/ingest/enrich-only")
def enrich_only(
    req: IngestRequest,
    background_tasks: BackgroundTasks,
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    """Re-run Phase 2 telemetry enrichment for an already-ingested session."""
    _verify(x_worker_secret)
    session_key = _make_session_key(req.year, req.gp_name, req.session_type)

    db_client.telemetry_sessions().update_one(
        {"sessionKey": session_key},
        {"$set": {"telemetryStatus": "pending", "telemetryError": None}},
    )

    background_tasks.add_task(
        _enrich_telemetry, session_key, req.year, req.gp_name, req.session_type
    )
    return {"sessionKey": session_key, "status": "enrichment_queued"}


@router.post("/ingest/enrich-positions")
def enrich_positions(
    req: IngestRequest,
    background_tasks: BackgroundTasks,
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    """Re-run Phase 3 position enrichment for an already-ingested session."""
    _verify(x_worker_secret)
    session_key = _make_session_key(req.year, req.gp_name, req.session_type)

    db_client.telemetry_sessions().update_one(
        {"sessionKey": session_key},
        {"$set": {"positionsStatus": "pending", "positionsError": None}},
    )

    background_tasks.add_task(
        _enrich_positions, session_key, req.year, req.gp_name, req.session_type
    )
    return {"sessionKey": session_key, "status": "positions_enrichment_queued"}


@router.get("/sessions/available")
def list_available_sessions(
    year: int,
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    """Return list of F1 sessions available via Fast-F1 for a given year.

    Uses each Event's actual Session1..Session5 columns so the result reflects
    real weekend composition (conventional vs sprint vs sprint_shootout vs
    sprint_qualifying), with the scheduled UTC start time per session.
    """
    _verify(x_worker_secret)
    try:
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        results: list[dict] = []
        for _, event in schedule.iterrows():
            gp_name      = str(event.get("EventName", ""))
            country      = str(event.get("Country", ""))
            circuit_name = str(event.get("Location", ""))
            event_format = str(event.get("EventFormat", ""))
            round_number = int(event["RoundNumber"]) if pd.notna(event.get("RoundNumber")) else 0

            for n in range(1, 6):
                name_col = f"Session{n}"
                date_col = f"Session{n}DateUtc"
                session_name = event.get(name_col)
                if not session_name or pd.isnull(session_name):
                    continue
                abbr = _SESSION_NAME_TO_ABBR.get(str(session_name))
                if not abbr:
                    continue  # unknown / future format

                session_date = event.get(date_col)
                date_iso = (
                    pd.Timestamp(session_date).tz_localize("UTC").isoformat()
                    if session_date is not None and pd.notna(session_date)
                       and getattr(pd.Timestamp(session_date), "tzinfo", None) is None
                    else (pd.Timestamp(session_date).isoformat()
                          if session_date is not None and pd.notna(session_date) else None)
                )

                results.append({
                    "sessionKey":   _make_session_key(year, gp_name, abbr),
                    "year":         year,
                    "round":        round_number,
                    "gpName":       gp_name,
                    "sessionType":  abbr,
                    "sessionName":  str(session_name),
                    "sessionDate":  date_iso,
                    "country":      country,
                    "circuitName":  circuit_name,
                    "eventFormat":  event_format,
                })
        # Sort by round, then by session order within the weekend
        results.sort(key=lambda r: (r["round"], r["sessionDate"] or ""))
        return {"sessions": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
