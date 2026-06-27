"""Lap-telemetry channel extraction + per-lap aggregates (donor Phase 2).

The donor stored full ~100 Hz channels in Mongo and strided at read time. We
instead compute the aggregates from the FULL-resolution arrays (so braking/DRS
event counts stay accurate), then stride-downsample the channels to ~20 Hz for
storage in vizf1_lap_telemetry. The clip route strides these further to a
requested hz at read time.

Session is assumed already loaded with laps=True, telemetry=True.
"""
from __future__ import annotations

import logging

import pandas as pd

from .extract import aggregate_from_arrays, td_to_seconds

logger = logging.getLogger(__name__)

LAP_TELEMETRY_HZ = 20
_LAP_TELEMETRY_PERIOD_S = 1.0 / LAP_TELEMETRY_HZ

# Channels persisted for the clip dashboard. sessionTime/distance are kept for
# sync + the x-axis; the rest are the gauges.
_STORE_CHANNELS = ("sessionTime", "distance", "speed", "throttle", "brake", "drs", "nGear", "rpm")


def _stride_keep_indices(session_time_sec: list[float], target_period_s: float) -> list[int]:
    """Indices that keep ~one sample per target period, by session time."""
    keep: list[int] = []
    last_t = None
    for i, t in enumerate(session_time_sec):
        if t is None or t != t:  # None / NaN
            continue
        if last_t is None or (t - last_t) >= target_period_s:
            keep.append(i)
            last_t = t
    return keep


def extract_lap_telemetry(session, session_key: str):
    """Return (channel_rows, aggregates_by_key).

    channel_rows -> vizf1_lap_telemetry rows (downsampled to ~20 Hz).
    aggregates_by_key -> {(driver_number, lap): aggregate dict} from full-res arrays.
    """
    channel_rows: list[dict] = []
    aggregates: dict[tuple[int, int], dict] = {}

    for _, lap in session.laps.iterlaps():
        lap_num = int(lap["LapNumber"]) if pd.notna(lap.get("LapNumber")) else None
        drv_num = int(lap["DriverNumber"]) if pd.notna(lap.get("DriverNumber")) else None
        if lap_num is None or drv_num is None:
            continue
        try:
            tel = lap.get_telemetry()
            if tel is None or tel.empty:
                continue
            tel = tel.add_distance()
            tel = tel.add_driver_ahead()

            def _col(name, default):
                return tel[name].fillna(default).tolist() if name in tel.columns else []

            session_time = (
                [td_to_seconds(v) for v in tel["SessionTime"]] if "SessionTime" in tel.columns else []
            )
            speed = _col("Speed", 0.0)
            throttle = _col("Throttle", 0.0)
            brake = [int(b) for b in _col("Brake", False)]
            drs = [int(d) for d in _col("DRS", 0)]
            n_gear = [int(g) for g in _col("nGear", 0)]
            rpm = [int(r) for r in _col("RPM", 0)]
            z = _col("Z", 0.0)
            distance = _col("Distance", 0.0)
            dist_to_ahead = [
                g if g == g else -1.0
                for g in (
                    tel["DistanceToDriverAhead"].tolist()
                    if "DistanceToDriverAhead" in tel.columns
                    else []
                )
            ]

            # Aggregate from full-resolution arrays (accurate event counts).
            agg = aggregate_from_arrays(
                session_time_sec=session_time,
                speed=speed,
                throttle=throttle,
                brake=brake,
                drs=drs,
                n_gear=n_gear,
                distance=distance,
                dist_to_ahead=dist_to_ahead,
                lap_start_sec=td_to_seconds(lap.get("LapStartTime")),
                s1_end_sec=td_to_seconds(lap.get("Sector1SessionTime")),
                s2_end_sec=td_to_seconds(lap.get("Sector2SessionTime")),
                rpm=rpm,
                z=z,
            )
            aggregates[(drv_num, lap_num)] = agg

            # Stride-downsample channels for storage.
            keep = _stride_keep_indices(session_time, _LAP_TELEMETRY_PERIOD_S)
            if not keep:
                continue
            full = {
                "sessionTime": [round(session_time[i], 4) if session_time[i] is not None else None for i in keep],
                "distance":    [round(distance[i], 1) if i < len(distance) else None for i in keep],
                "speed":       [round(speed[i], 1) if i < len(speed) else None for i in keep],
                "throttle":    [round(throttle[i], 1) if i < len(throttle) else None for i in keep],
                "brake":       [brake[i] if i < len(brake) else 0 for i in keep],
                "drs":         [drs[i] if i < len(drs) else 0 for i in keep],
                "nGear":       [n_gear[i] if i < len(n_gear) else 0 for i in keep],
                "rpm":         [rpm[i] if i < len(rpm) else 0 for i in keep],
            }
            channel_rows.append({
                "session_key":    session_key,
                "driver_number":  drv_num,
                "lap":            lap_num,
                "sample_rate_hz": LAP_TELEMETRY_HZ,
                "frame_count":    len(keep),
                "channels":       {k: full[k] for k in _STORE_CHANNELS if k in full},
            })
        except Exception as exc:
            logger.debug("lap telemetry skip drv=%s lap=%s: %s", drv_num, lap_num, exc)
            continue

    return channel_rows, aggregates
