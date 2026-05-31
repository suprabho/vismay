import json
import os
import pandas as pd
import fastf1
from crewai.tools import tool

_cache_dir = os.environ.get("FASTF1_CACHE_DIR", "/tmp/fastf1_cache")
os.makedirs(_cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(_cache_dir)


def _parse_session_key(session_key: str):
    """Split "2024_monaco_R" → (2024, "Monaco", "R")."""
    parts = session_key.split("_")
    if len(parts) < 3:
        raise ValueError(
            f"Cannot parse session_key {session_key!r}. Expected format: YEAR_GP_TYPE"
        )
    year = int(parts[0])
    session_type = parts[-1]
    gp_slug = "_".join(parts[1:-1])
    gp_name = gp_slug.replace("_", " ").title()
    return year, gp_name, session_type


def _load_session(session_key: str) -> fastf1.core.Session:
    year, gp_name, session_type = _parse_session_key(session_key)
    session = fastf1.get_session(year, gp_name, session_type)
    session.load(laps=True, telemetry=False, weather=False, messages=True)
    return session


def _load_session_with_telemetry(session_key: str) -> fastf1.core.Session:
    year, gp_name, session_type = _parse_session_key(session_key)
    session = fastf1.get_session(year, gp_name, session_type)
    session.load(laps=True, telemetry=True, weather=True, messages=True)
    return session


def _td_to_seconds(td) -> float | None:
    if pd.isnull(td):
        return None
    if hasattr(td, "total_seconds"):
        return td.total_seconds()
    try:
        return float(td)
    except (TypeError, ValueError):
        return None


@tool("fetch_fastf1_laps")
def fetch_laps(session_key: str, driver_number: int = 0) -> str:
    """Fetch lap time data via Fast-F1 for a given session and optional driver number."""
    session = _load_session(session_key)
    laps = session.laps.copy()
    if driver_number:
        laps = laps[laps["DriverNumber"].astype(str) == str(driver_number)]
    cols = [
        "DriverNumber", "LapNumber", "LapTime",
        "Sector1Time", "Sector2Time", "Sector3Time",
        "Compound", "TyreLife", "Stint", "IsPersonalBest", "PitInTime",
    ]
    available = [c for c in cols if c in laps.columns]
    subset = laps[available].head(200).copy()
    for col in subset.select_dtypes(include=["timedelta64[ns]"]).columns:
        subset[col] = subset[col].apply(_td_to_seconds)
    return subset.to_json(orient="records")


@tool("fetch_fastf1_stints")
def fetch_stints(session_key: str) -> str:
    """Fetch tire stint data (compound, lap_start, lap_end) via Fast-F1."""
    session = _load_session(session_key)
    laps = session.laps
    if laps.empty or "Stint" not in laps.columns:
        return json.dumps([])
    grouped = (
        laps.groupby(["DriverNumber", "Stint", "Compound"])["LapNumber"]
        .agg(lap_start="min", lap_end="max")
        .reset_index()
    )
    return grouped.to_json(orient="records")


@tool("fetch_fastf1_race_control")
def fetch_race_control(session_key: str) -> str:
    """Fetch race control messages (safety car, VSC, flags) via Fast-F1."""
    session = _load_session(session_key)
    msgs = session.race_control_messages
    if msgs is None or msgs.empty:
        return json.dumps([])
    result = []
    for _, row in msgs.iterrows():
        result.append({
            "lap_number": int(row["Lap"]) if pd.notna(row.get("Lap")) else None,
            "category":   str(row.get("Category", "")),
            "message":    str(row.get("Message", "")),
            "flag":       str(row.get("Flag", "")),
            "status":     str(row.get("Status", "")),
        })
    return json.dumps(result)


@tool("fetch_fastf1_drivers")
def fetch_drivers(session_key: str) -> str:
    """Fetch driver roster for a session via Fast-F1."""
    session = _load_session(session_key)
    drivers = []
    for abbr in session.laps["Driver"].unique() if not session.laps.empty else []:
        try:
            info = session.get_driver(abbr)
            colour = str(info.get("TeamColor", "ffffff")).lstrip("#")
            drivers.append({
                "driver_number": int(info.get("DriverNumber", 0)),
                "full_name":     info.get("FullName", ""),
                "name_acronym":  abbr,
                "team_name":     info.get("TeamName", ""),
                "team_colour":   f"#{colour}",
            })
        except Exception:
            continue
    return json.dumps(drivers)


@tool("fetch_fastf1_results")
def fetch_results(session_key: str) -> str:
    """Fetch session results (grid position, finish position, points, Q1/Q2/Q3 times) via Fast-F1."""
    session = _load_session(session_key)
    try:
        results_df = session.results
        if results_df is None or results_df.empty:
            return json.dumps([])
        out = []
        for _, row in results_df.iterrows():
            out.append({
                "driver_number":       int(row["DriverNumber"]) if pd.notna(row.get("DriverNumber")) else 0,
                "abbreviation":        str(row.get("Abbreviation", "")),
                "grid_position":       int(row["GridPosition"]) if pd.notna(row.get("GridPosition")) else None,
                "position":            int(row["Position"])     if pd.notna(row.get("Position"))     else None,
                "classified_position": str(row["ClassifiedPosition"]) if pd.notna(row.get("ClassifiedPosition")) else None,
                "points":              float(row["Points"]) if pd.notna(row.get("Points")) else 0.0,
                "status":              str(row.get("Status", "")),
                "q1_time_sec":         _td_to_seconds(row.get("Q1")),
                "q2_time_sec":         _td_to_seconds(row.get("Q2")),
                "q3_time_sec":         _td_to_seconds(row.get("Q3")),
            })
        return json.dumps(out)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@tool("fetch_fastf1_weather")
def fetch_weather(session_key: str) -> str:
    """Fetch weather data (temp, humidity, rainfall) sampled per lap via Fast-F1."""
    year, gp_name, session_type = _parse_session_key(session_key)
    session = fastf1.get_session(year, gp_name, session_type)
    session.load(laps=True, telemetry=False, weather=True, messages=False)
    try:
        weather = session.weather_data
        laps_df = session.laps
        if weather is None or weather.empty:
            return json.dumps([])
        out = []
        seen: set[int] = set()
        for _, row in laps_df.iterrows():
            lap_num = int(row["LapNumber"]) if pd.notna(row.get("LapNumber")) else None
            if lap_num is None or lap_num in seen:
                continue
            lap_start = row.get("LapStartTime")
            if lap_start is None or pd.isnull(lap_start):
                continue
            idx = (weather["Time"] - lap_start).abs().idxmin()
            w = weather.loc[idx]
            out.append({
                "lap":            lap_num,
                "air_temp":       float(w.get("AirTemp",       0) or 0),
                "track_temp":     float(w.get("TrackTemp",     0) or 0),
                "humidity":       float(w.get("Humidity",      0) or 0),
                "wind_speed":     float(w.get("WindSpeed",     0) or 0),
                "wind_direction": float(w.get("WindDirection", 0) or 0),
                "rainfall":       bool(w.get("Rainfall",       False)),
            })
            seen.add(lap_num)
        return json.dumps(out)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@tool("fetch_fastf1_telemetry_aggregates")
def fetch_telemetry_aggregates(session_key: str, driver_number: int = 0) -> str:
    """Fetch per-lap telemetry aggregates (speed, throttle, braking, DRS) via Fast-F1. Slow — loads raw telemetry."""
    year, gp_name, session_type = _parse_session_key(session_key)
    session = fastf1.get_session(year, gp_name, session_type)
    session.load(laps=True, telemetry=True, weather=False, messages=False)
    laps = session.laps
    if driver_number:
        laps = laps.pick_drivers(driver_number)
    out = []
    for _, lap in laps.iterlaps():
        lap_num = int(lap["LapNumber"]) if pd.notna(lap.get("LapNumber")) else None
        drv_num = int(lap["DriverNumber"]) if pd.notna(lap.get("DriverNumber")) else 0
        if lap_num is None:
            continue
        try:
            tel = lap.get_telemetry().add_distance()
            speed = tel["Speed"].dropna() if "Speed" in tel.columns else pd.Series(dtype=float)
            out.append({
                "driver_number":  drv_num,
                "lap":            lap_num,
                "avg_speed":      round(float(speed.mean()), 2) if not speed.empty else 0.0,
                "max_speed":      round(float(speed.max()),  2) if not speed.empty else 0.0,
                "lap_distance_m": round(float(tel["Distance"].max()), 1) if "Distance" in tel.columns else 0.0,
            })
        except Exception:
            continue
    return json.dumps(out[:200])  # cap output for LLM context
