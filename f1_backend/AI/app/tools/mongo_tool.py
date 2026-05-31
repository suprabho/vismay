import json
from bson import ObjectId
from crewai.tools import tool
from ..utils import db_client


class _JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        return super().default(obj)


def _dumps(obj) -> str:
    return json.dumps(obj, cls=_JSONEncoder, default=str)


@tool("read_mongo_session")
def read_session(
    session_key: str,
    driver_number: int | None = None,
    start_lap: int | None = None,
    end_lap: int | None = None
) -> str:
    """Read processed telemetry session data from MongoDB. Returns JSON string.
    Use driver_number, start_lap, and end_lap to filter the data and avoid exceeding context limits."""
    doc = db_client.telemetry_sessions().find_one({"sessionKey": session_key})
    if not doc:
        return f"No session found for key {session_key}"
    doc.pop("_id", None)
    
    laps = doc.get("processedLaps", [])
    if driver_number is not None:
        try:
            dn = int(driver_number)
            laps = [l for l in laps if l.get("driverNumber") == dn]
        except (ValueError, TypeError):
            pass
            
    if start_lap is not None or end_lap is not None:
        try:
            s_lap = int(start_lap) if start_lap is not None else 0
            e_lap = int(end_lap) if end_lap is not None else 9999
            laps = [l for l in laps if s_lap <= l.get("lap", 0) <= e_lap]
        except (ValueError, TypeError):
            pass
            
    # Fallback cap when no filters are provided. 100 was too low for session-scope
    # crews — a 55-lap, 20-driver race has ~1100 lap records; 100 only covers ~5
    # drivers' data. Raised to 500 so the session analyst sees the full grid.
    # Callers that need less should pass explicit driver_number / lap range filters.
    if driver_number is None and start_lap is None and end_lap is None:
        laps = laps[:500]
        
    doc["processedLaps"] = laps
    return _dumps(doc)


@tool("read_mongo_graph_specs")
def read_graph_specs(
    session_key: str,
    driver_number: int | None = None,
    team_id: str | None = None,
) -> str:
    """Read available graph specs for a session from MongoDB. Optionally filter
    by driver_number or team_id. Driver/team-scoped reads also include
    session-wide comparison graphs (those without driverNumber / teamId), so the
    Chart Curator can pick session-context references like overall lap-time
    comparison or grid pace distribution. Returns JSON array."""
    query: dict = {"sessionKey": session_key}
    if driver_number is not None:
        query["$or"] = [
            {"driverNumber": int(driver_number)},
            {"scopeKind": "session"},
            {"driverNumber": {"$exists": False}, "teamId": {"$exists": False}},
        ]
    elif team_id:
        query["$or"] = [
            {"teamId": team_id},
            {"scopeKind": "session"},
            {"driverNumber": {"$exists": False}, "teamId": {"$exists": False}},
        ]
    specs = list(db_client.graph_specs().find(query))
    for s in specs:
        s["id"] = str(s.pop("_id"))
        s.pop("dataPoints", None)  # keep specs light
    return _dumps(specs)


@tool("read_mongo_signals")
def read_signals(
    session_key: str,
    driver_number: int | None = None,
    team_id: str | None = None,
    signal_ids: list[str] | None = None,
) -> str:
    """Read detected signals for a session from MongoDB. Optionally filter
    by driver_number, team_id, or specific signal_ids. Returns JSON array."""
    query: dict = {"sessionKey": session_key}
    
    if signal_ids:
        try:
            query["_id"] = {"$in": [ObjectId(sid) for sid in signal_ids]}
        except Exception:
            pass
    else:
        if driver_number is not None:
            query["driverNumber"] = int(driver_number)
        if team_id:
            query["teamId"] = team_id
            
    sigs = list(db_client.signals().find(query))
    for s in sigs:
        s["id"] = str(s.pop("_id"))
    return _dumps(sigs)
