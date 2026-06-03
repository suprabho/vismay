import re

NEW_NODES = """
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
    
    clean = df[df.get("isRepresentative", True) == True].copy()
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
    
    # Process lap 1 telemetry for drivers
    start_times = {}
    for d in drivers:
        dn = d.get("driverNumber")
        if dn is None:
            continue
        dn = int(dn)
        docs = db_client.raw_lap_telemetry().find(
            {"sessionKey": sk, "driverNumber": dn, "lap": 1},
            {"_id": 0, "sessionTime": 1, "speed": 1, "distance": 1}
        )
        for doc in docs:
            dist = doc.get("distance") or []
            speed = doc.get("speed") or []
            times = doc.get("sessionTime") or []
            if not dist or not times or len(dist) != len(times):
                continue
            
            # find time taken from distance 0 to distance 200m
            t_start = times[0]
            t_200 = None
            for i, d_val in enumerate(dist):
                if d_val >= 200:
                    t_200 = times[i]
                    break
            if t_200 is not None:
                start_times[dn] = (t_200 - t_start)
    
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
        
    clean = df[df.get("isRepresentative", True) == True].copy()
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

def sync_graphs(state: TelemetryState) -> dict:
    \"\"\"Dummy node to synchronize parallel graph generation branches before curation.\"\"\"
    _update_run_status(state["story_run_id"], "running", "sync_graphs: parallel branches merged")
    return {}

"""

def insert():
    path = "/Users/rohittiwari/VsCode_Projects/apex/AI/app/pipelines/telemetry_graph.py"
    with open(path, "r") as f:
        content = f.read()

    # Find the LLM curation node
    idx = content.find("def llm_curate_insights")
    if idx == -1:
        print("Could not find llm_curate_insights")
        return
        
    new_content = content[:idx] + NEW_NODES + content[idx:]
    with open(path, "w") as f:
        f.write(new_content)

if __name__ == "__main__":
    insert()
