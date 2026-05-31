import numpy as np
from app.tools.mongo_tool import db_client
from bson import ObjectId

def create_telemetry_trace_graph(session_key: str, driver_numbers: list[int], lap_number: int, channel: str) -> dict | None:
    lap_i = int(lap_number)
    valid_channels = {
        "speed": ("Speed (km/h)", "km/h"),
        "throttle": ("Throttle (%)", "%"),
        "brake": ("Brake", ""),
        "drs": ("DRS", ""),
        "nGear": ("Gear", ""),
        "rpm": ("RPM", "rpm")
    }
    if channel not in valid_channels:
        return None
        
    targets = [int(d) for d in driver_numbers]
    if not targets:
        return None
        
    docs = {}
    max_dist_len = 0
    best_dist = None
    for d in targets:
        doc = db_client.raw_lap_telemetry().find_one(
            {"sessionKey": session_key, "driverNumber": d, "lap": lap_i},
            {"distance": 1, channel: 1, "_id": 0}
        )
        if doc and doc.get("distance") and doc.get(channel):
            docs[d] = doc
            if len(doc["distance"]) > max_dist_len:
                max_dist_len = len(doc["distance"])
                best_dist = doc["distance"]
                
    if not docs or not best_dist:
        return None
        
    def _downsample(arr, max_n=200):
        if not isinstance(arr, list) or len(arr) <= max_n:
            return arr
        step = max(1, len(arr) // max_n)
        return arr[::step]
        
    dist = _downsample(best_dist)
    
    def _resample(doc_d, doc_v):
        if not doc_d or not doc_v:
            return [None] * len(dist)
        out = []
        j = 0
        for x in dist:
            while j + 1 < len(doc_d) and doc_d[j + 1] < x:
                j += 1
            try:
                val = float(doc_v[min(j, len(doc_v) - 1)])
                out.append(round(val, 1))
            except Exception:
                out.append(None)
        return out

    data_points = []
    series_data = {}
    for d in targets:
        if d in docs:
            series_data[d] = _resample(docs[d]["distance"], docs[d][channel])
            
    for i, x in enumerate(dist):
        row = {"distance": round(float(x), 1)}
        for d in targets:
            if d in series_data:
                row[str(d)] = series_data[d][i]
        data_points.append(row)
        
    series = []
    colors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#33FFF6"]
    
    _focus_doc = db_client.telemetry_sessions().find_one(
        {"sessionKey": session_key}, {"drivers": 1, "_id": 0},
    ) or {}
    _roster = _focus_doc.get("drivers", []) or []
    
    for idx, d in enumerate(targets):
        if d not in docs: continue
        roster_doc = next((r for r in _roster if r.get("driverNumber") == d), {})
        abbr = roster_doc.get("abbreviation", f"#{d}")
        c = str(roster_doc.get("teamColor", colors[idx % len(colors)])).lstrip("#")
        series.append({
            "id": str(d),
            "label": f"{abbr} (L{lap_i})",
            "driverNumber": d,
            "color": f"#{c}",
            "dataKey": str(d),
            "type": "actual"
        })
        
    label, unit = valid_channels[channel]
    spec = {
        "type": "multi_line",
        "title": f"Custom {channel.title()} Trace - Lap {lap_i}",
        "sessionKey": session_key,
        "scopeKind": "story_custom",
        "xAxis": {"key": "distance", "label": "Distance (m)", "unit": "m"},
        "yAxis": {"key": channel, "label": label, "unit": unit},
        "series": series,
        "dataPoints": data_points,
        "generatedByAI": True
    }
    
    res = db_client.graph_specs().insert_one(spec)
    spec["id"] = str(res.inserted_id)
    spec.pop("_id", None)
    spec.pop("dataPoints", None)
    return spec

def create_pace_projection_graph(session_key: str, driver_numbers: list[int], forecast_laps: int = 10) -> dict | None:
    targets = [int(d) for d in driver_numbers]
    if not targets:
        return None

    # Lap data lives embedded in telemetry_sessions.processedLaps[], not a
    # standalone `laps` collection. Schema (per CLAUDE.md):
    #   { driverNumber, lap, lapTimeSec, sectors, compound, stintLap,
    #     tyreLife, freshTyre, events, isRepresentative? }
    sess_doc = db_client.telemetry_sessions().find_one(
        {"sessionKey": session_key},
        {"processedLaps": 1, "_id": 0},
    ) or {}
    target_set = set(targets)
    laps_docs = [
        lp for lp in (sess_doc.get("processedLaps") or [])
        if isinstance(lp, dict) and lp.get("driverNumber") in target_set
    ]
    # Stable lap ordering (input is already roughly sorted, but be defensive).
    laps_docs.sort(key=lambda lp: (lp.get("driverNumber") or 0, lp.get("lap") or 0))

    if not laps_docs:
        return None

    from collections import defaultdict
    driver_laps = defaultdict(list)
    driver_times = defaultdict(list)

    for doc in laps_docs:
        lt = doc.get("lapTimeSec")
        ln = doc.get("lap")
        dn = doc.get("driverNumber")
        if lt is None or ln is None or dn is None:
            continue
        try:
            lt_f = float(lt)
            ln_i = int(ln)
        except (TypeError, ValueError):
            continue
        driver_laps[dn].append(ln_i)
        driver_times[dn].append(lt_f)
        
    series = []
    colors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#33FFF6"]
    
    _focus_doc = db_client.telemetry_sessions().find_one(
        {"sessionKey": session_key}, {"drivers": 1, "_id": 0},
    ) or {}
    _roster = _focus_doc.get("drivers", []) or []
    
    data_points_map = {}
    max_lap = max(max(laps) for laps in driver_laps.values()) if driver_laps else 0
    
    for idx, d in enumerate(targets):
        if d not in driver_laps or len(driver_laps[d]) < 3:
            continue
            
        roster_doc = next((r for r in _roster if r.get("driverNumber") == d), {})
        abbr = roster_doc.get("abbreviation", f"#{d}")
        c = str(roster_doc.get("teamColor", colors[idx % len(colors)])).lstrip("#")
        
        series.append({
            "id": f"actual_{d}",
            "label": f"{abbr} Actual",
            "driverNumber": d,
            "color": f"#{c}",
            "dataKey": f"actual_{d}",
            "type": "actual"
        })
        series.append({
            "id": f"proj_{d}",
            "label": f"{abbr} Projected",
            "driverNumber": d,
            "color": f"#{c}",
            "dataKey": f"proj_{d}",
            "type": "projected",
            "strokeDash": "4 2"
        })
        
        laps = driver_laps[d]
        times = driver_times[d]
        
        # Polyfit over last 10 laps
        recent_n = min(10, len(laps))
        x_recent = laps[-recent_n:]
        y_recent = times[-recent_n:]
        
        try:
            poly = np.poly1d(np.polyfit(x_recent, y_recent, min(2, recent_n - 1)))
        except Exception:
            _last = y_recent[-1]
            poly = lambda x, _v=_last: _v
            
        proj_laps = list(range(max_lap + 1, max_lap + 1 + forecast_laps))
        proj_times = [float(poly(lx)) for lx in proj_laps]
        
        for l, t in zip(laps, times):
            if l not in data_points_map: data_points_map[l] = {"lap": l}
            data_points_map[l][f"actual_{d}"] = round(t, 3)
            
        for l, t in zip(proj_laps, proj_times):
            if l not in data_points_map: data_points_map[l] = {"lap": l}
            data_points_map[l][f"proj_{d}"] = round(t, 3)
            
    if not series:
        return None
        
    data_points = [data_points_map[l] for l in sorted(data_points_map.keys())]
    
    spec = {
        "type": "projection",
        "title": f"Story Projection - Gap Forecast",
        "sessionKey": session_key,
        "scopeKind": "story_custom",
        "xAxis": {"key": "lap", "label": "Lap", "unit": "lap"},
        "yAxis": {"key": "lapTime", "label": "Lap Time (s)", "unit": "s"},
        "series": series,
        "dataPoints": data_points,
        "projectionConfig": {
            "method": "polynomial",
            "historicalLaps": 10,
            "forecastLaps": forecast_laps,
            "confidenceBand": False,
        },
        "generatedByAI": True
    }
    
    res = db_client.graph_specs().insert_one(spec)
    spec["id"] = str(res.inserted_id)
    spec.pop("_id", None)
    spec.pop("dataPoints", None)
    return spec
