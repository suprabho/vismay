"""Pure FastF1 extraction helpers — ported verbatim from the f1_backend donor
(f1_backend/AI/app/routes/ingest.py). These are pandas/FastF1 -> plain dict and
carry no persistence concern, so they port unchanged.
"""
from __future__ import annotations

import logging
import re

import pandas as pd
from fastf1.ergast import Ergast

logger = logging.getLogger(__name__)


def slugify(name: str) -> str:
    # Must mirror Backend telemetry.controller.ts: .replace(/[\s-]+/g, '_')
    return re.sub(r"[\s-]+", "_", name.lower())


def make_session_key(year: int, gp_name: str, session_type: str) -> str:
    return f"{year}_{slugify(gp_name)}_{session_type}"


def circuit_key(gp_name: str) -> str:
    return slugify(gp_name)


def td_to_seconds(td) -> float | None:
    if pd.isnull(td):
        return None
    if hasattr(td, "total_seconds"):
        return td.total_seconds()
    try:
        return float(td)
    except (TypeError, ValueError):
        return None


_FINISHER_STATUSES = ("finished",)


def classify_dnf(status: str) -> tuple[bool, str | None]:
    s = (status or "").strip()
    if not s:
        return False, None
    sl = s.lower()
    if sl in _FINISHER_STATUSES or sl.startswith("+"):
        return False, None
    return True, s


def extract_session_results(session) -> list[dict]:
    try:
        results_df = session.results
        if results_df is None or results_df.empty:
            return []
        out = []
        for _, row in results_df.iterrows():
            dn = int(row["DriverNumber"]) if pd.notna(row.get("DriverNumber")) else 0
            status_str = str(row.get("Status", ""))
            dnf, dnf_reason = classify_dnf(status_str)
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
                "timeSec":            td_to_seconds(row.get("Time")),
                "laps":               int(row["Laps"]) if pd.notna(row.get("Laps")) else None,
                "q1TimeSec":          td_to_seconds(row.get("Q1")),
                "q2TimeSec":          td_to_seconds(row.get("Q2")),
                "q3TimeSec":          td_to_seconds(row.get("Q3")),
                "headshotUrl":        str(row["HeadshotUrl"]) if pd.notna(row.get("HeadshotUrl")) else None,
                "countryCode":        str(row["CountryCode"]) if pd.notna(row.get("CountryCode")) else None,
            })
        return out
    except Exception as exc:
        logger.warning("extract_session_results failed: %s", exc)
        return []


def extract_weather(session, laps_df: pd.DataFrame) -> list[dict]:
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
        logger.warning("extract_weather failed: %s", exc)
        return []


def _slope_sec_per_lap(lap_times: list[float]) -> float | None:
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


def extract_stints(laps_df: pd.DataFrame) -> list[dict]:
    if laps_df.empty or "Stint" not in laps_df.columns:
        return []
    out = []
    try:
        for (dn, stint_num, compound), grp in laps_df.groupby(
            ["DriverNumber", "Stint", "Compound"], sort=False
        ):
            grp = grp.sort_values("LapNumber")
            start_lap = int(grp["LapNumber"].min())
            end_lap = int(grp["LapNumber"].max())
            total = int(len(grp))

            pit_in_lap = pit_out_lap = pit_delta = None

            if "PitInTime" in grp.columns:
                pit_in_rows = grp[grp["PitInTime"].notna()]
                if not pit_in_rows.empty:
                    pit_in_lap = int(pit_in_rows["LapNumber"].iloc[-1])
                    if "PitOutTime" in grp.columns:
                        last = pit_in_rows.iloc[-1]
                        if pd.notna(last.get("PitOutTime")):
                            delta = (td_to_seconds(last["PitOutTime"]) or 0) - (
                                td_to_seconds(last["PitInTime"]) or 0
                            )
                            if delta and delta > 0:
                                pit_delta = round(delta, 2)

            if "PitOutTime" in grp.columns:
                pit_out_rows = grp[grp["PitOutTime"].notna()]
                if not pit_out_rows.empty:
                    pit_out_lap = int(pit_out_rows["LapNumber"].iloc[0])

            avg_deg_per_lap: float | None = None
            try:
                clean = grp
                if "PitInTime" in clean.columns:
                    clean = clean[clean["PitInTime"].isna()]
                if "PitOutTime" in clean.columns:
                    clean = clean[clean["PitOutTime"].isna()]
                lap_times = (
                    [td_to_seconds(t) for t in clean["LapTime"]]
                    if "LapTime" in clean.columns
                    else []
                )
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
        logger.warning("extract_stints failed: %s", exc)
    return out


def fetch_championship_standings(year: int) -> dict[str, dict]:
    """Year-to-date driver standings from Ergast, keyed by FastF1 driverId.
    Empty dict on any failure — caller must tolerate missing data."""
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
            out[str(driver_id)] = {"position": position, "points": points, "wins": wins}
        return out
    except Exception as exc:
        logger.warning("fetch_championship_standings(%s) failed: %s", year, exc)
        return {}


def extract_drivers(session, standings: dict[str, dict] | None = None) -> list[dict]:
    """Full driver roster (incl. DNS) from session.drivers, with championship
    fields attached when `standings` is provided."""
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
        country = info.get("CountryCode")
        driver_id = str(info.get("DriverId", ""))
        standing = standings.get(driver_id) if driver_id else None

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
            "countryCode":          str(country) if country else None,
            "championshipPosition": standing.get("position") if standing else None,
            "championshipPoints":   standing.get("points") if standing else None,
            "championshipWins":     standing.get("wins") if standing else None,
        })
    return out


def build_processed_laps(session, laps_df: pd.DataFrame) -> list[dict]:
    """Per-driver per-lap processed records (keeps incomplete / out-laps with
    lapTimeSec=None). Ported from the inline logic in the donor ingest_session."""
    if laps_df.empty:
        return []

    # stint lookup: "driverNum:lap" -> {compound, stintLap, tyreLife, freshTyre}
    stint_map: dict[str, dict] = {}
    if "Stint" in laps_df.columns:
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

    pit_laps: set[str] = set()
    if "PitInTime" in laps_df.columns:
        for _, row in laps_df[laps_df["PitInTime"].notna()].iterrows():
            dn = str(int(row["DriverNumber"])) if pd.notna(row.get("DriverNumber")) else None
            lap_num = int(row["LapNumber"]) if pd.notna(row.get("LapNumber")) else None
            if dn and lap_num:
                pit_laps.add(f"{dn}:{lap_num}")

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

    best_by_driver: dict[int, float] = {}
    for _, row in laps_df.iterrows():
        dn = int(row["DriverNumber"]) if pd.notna(row.get("DriverNumber")) else 0
        lap_time = td_to_seconds(row.get("LapTime"))
        if lap_time and (dn not in best_by_driver or lap_time < best_by_driver[dn]):
            best_by_driver[dn] = lap_time

    out: list[dict] = []
    for _, row in laps_df.iterrows():
        dn = int(row["DriverNumber"]) if pd.notna(row.get("DriverNumber")) else 0
        lap_num = int(row["LapNumber"]) if pd.notna(row.get("LapNumber")) else 0
        if dn == 0 or lap_num == 0:
            continue
        lap_time = td_to_seconds(row.get("LapTime"))
        s1 = td_to_seconds(row.get("Sector1Time"))
        s2 = td_to_seconds(row.get("Sector2Time"))
        s3 = td_to_seconds(row.get("Sector3Time"))
        stint_info = stint_map.get(
            f"{dn}:{lap_num}",
            {"compound": "UNKNOWN", "stintLap": 0, "tyreLife": 0, "freshTyre": False},
        )
        position = int(row["Position"]) if pd.notna(row.get("Position")) else None

        events: list[str] = []
        if lap_time is None:
            events.append("incomplete")
        if f"{dn}:{lap_num}" in pit_laps:
            events.append("pit_in")
        if lap_num in sc_laps:
            events.append("sc_deployed")
        if lap_time and best_by_driver.get(dn) == lap_time and lap_time > 0:
            events.append("personal_best")

        out.append({
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
            "position":     position,
            "events":       events,
        })
    return out


def aggregate_from_arrays(
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
    """Per-lap aggregate stats from parallel telemetry arrays (no pandas)."""
    n = len(speed)
    avg_speed = sum(speed) / n if n else 0.0
    max_speed = max(speed, default=0.0)
    avg_thr = sum(throttle) / n if n else 0.0

    braking = sum(1 for i in range(1, len(brake)) if not brake[i - 1] and brake[i])
    drs_acts = sum(
        1 for i in range(1, len(drs)) if drs[i - 1] not in (10, 12) and drs[i] in (10, 12)
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
        "avgThrottlePct":  round(avg_thr, 2),
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
