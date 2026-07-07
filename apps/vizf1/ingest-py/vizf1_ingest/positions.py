"""Circuit geometry + car-position extraction (donor Phase 3).

Ported from _upsert_circuit / _enrich_positions in the donor ingest.py. The math
(corner extraction, fastest-lap outline, elevation smoothing, 4 Hz frame
downsampling) is unchanged; the Mongo writes are replaced by returning row dicts
for the Supabase sink. The session is assumed already loaded with
laps=True, telemetry=True.
"""
from __future__ import annotations

import logging

import pandas as pd

from .extract import circuit_key as _circuit_key
from .extract import td_to_seconds

logger = logging.getLogger(__name__)

# Fast-F1 pos_data native rate is ~3-5 Hz. Downsample to a fixed rate so all
# drivers share a comparable time index and the replay plays smoothly.
POS_SAMPLE_RATE_HZ = 4
_POS_SAMPLE_PERIOD_MS = int(1000 / POS_SAMPLE_RATE_HZ)


def _nearest_time_index(times: list[float], target: float) -> int | None:
    best_i = None
    best_d = float("inf")
    for i, t in enumerate(times):
        if t != t:  # NaN
            continue
        d = abs(t - target)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


def build_circuit_row(session, year: int, gp_name: str) -> dict:
    """Return a vizf1_telemetry_circuits row from the fastest lap's geometry."""
    ckey = _circuit_key(gp_name)
    try:
        info = session.get_circuit_info()
    except Exception as exc:
        logger.debug("get_circuit_info failed for %s: %s", ckey, exc)
        info = None

    corners: list[dict] = []
    rotation_deg = 0.0
    if info is not None:
        try:
            for _, row in info.corners.iterrows():
                corners.append({
                    "number":   int(row["Number"]) if pd.notna(row.get("Number")) else 0,
                    "letter":   str(row.get("Letter", "")),
                    "x":        float(row["X"]) if pd.notna(row.get("X")) else 0.0,
                    "y":        float(row["Y"]) if pd.notna(row.get("Y")) else 0.0,
                    "angle":    float(row["Angle"]) if pd.notna(row.get("Angle")) else 0.0,
                    "distance": float(row["Distance"]) if pd.notna(row.get("Distance")) else 0.0,
                })
            rotation_deg = float(getattr(info, "rotation", 0.0) or 0.0)
        except Exception as exc:
            logger.debug("corner extract failed: %s", exc)

    outline_x: list[float] = []
    outline_y: list[float] = []
    outline_z: list[float] = []
    outline_t: list[float] = []
    sector_boundaries: dict | None = None
    try:
        fastest_lap = session.laps.pick_fastest()
        pos = fastest_lap.get_pos_data() if fastest_lap is not None else None
        if pos is not None and not pos.empty and {"X", "Y"}.issubset(pos.columns):
            step = max(1, len(pos) // 400)
            has_st = "SessionTime" in pos.columns
            has_z = "Z" in pos.columns
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
                    st = td_to_seconds(pos["SessionTime"].iloc[i])
                    outline_t.append(st if st is not None else float("nan"))

            if has_st and outline_t and fastest_lap is not None:
                s1_end = td_to_seconds(fastest_lap.get("Sector1SessionTime"))
                s2_end = td_to_seconds(fastest_lap.get("Sector2SessionTime"))
                if s1_end is not None and s2_end is not None:
                    idx1 = _nearest_time_index(outline_t, s1_end)
                    idx2 = _nearest_time_index(outline_t, s2_end)
                    if idx1 is not None and idx2 is not None and 0 < idx1 < idx2 < len(outline_x) - 1:
                        sector_boundaries = {"index1": idx1, "index2": idx2}
    except Exception as exc:
        logger.debug("track outline extract failed for %s: %s", ckey, exc)

    # Smooth noisy GPS elevation; drop z entirely if the source had no usable Z.
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

    logger.info(
        "Circuit %s/%s: %d corners, %d outline pts, z=%s, sectorBoundaries=%s",
        ckey, year, len(corners), len(outline_x), bool(outline_z), sector_boundaries,
    )
    return {
        "circuit_key":       ckey,
        "year":              year,
        "gp_name":           gp_name,
        "circuit_name":      str(session.event.get("Location", "")),
        "country":           str(session.event.get("Country", "")),
        "rotation_deg":      rotation_deg,
        "corners":           corners,
        "outline":           outline_doc,
        "bounds":            bounds,
        "sector_boundaries": sector_boundaries,
    }


def build_position_rows(session, session_key: str, ckey: str) -> list[dict]:
    """Return vizf1_car_positions rows (one per driver, columnar frames @ 4 Hz)."""
    laps = session.laps
    if laps.empty:
        return []
    driver_numbers = laps["DriverNumber"].dropna().unique()
    rows: list[dict] = []

    for dn_raw in driver_numbers:
        try:
            dn = int(dn_raw)
        except (TypeError, ValueError):
            continue
        try:
            driver_laps = laps[laps["DriverNumber"] == dn_raw]
            if driver_laps.empty:
                continue

            frames_t: list[int] = []
            frames_x: list[float] = []
            frames_y: list[float] = []
            frames_z: list[float] = []
            frames_lap: list[int] = []
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
                        secs = td_to_seconds(st)
                        t_ms = int(secs * 1000) if secs is not None else None
                        if t_ms is None:
                            continue
                        if t_ms - last_sample_ms < _POS_SAMPLE_PERIOD_MS:
                            continue
                        x = p.get("X")
                        y = p.get("Y")
                        if pd.isnull(x) or pd.isnull(y):
                            continue
                        z = p.get("Z")
                        status_raw = str(p.get("Status", "OnTrack"))
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

            rows.append({
                "session_key":    session_key,
                "circuit_key":    ckey,
                "driver_number":  dn,
                "sample_rate_hz": POS_SAMPLE_RATE_HZ,
                "frame_count":    len(frames_t),
                "t0_ms":          frames_t[0],
                "t_end_ms":       frames_t[-1],
                "frames": {
                    "t":      frames_t,
                    "x":      frames_x,
                    "y":      frames_y,
                    "z":      frames_z,
                    "lap":    frames_lap,
                    "status": frames_status,
                },
            })
        except Exception as drv_exc:
            logger.debug("pos drv=%s failed: %s", dn, drv_exc)
            continue
    return rows
