from pymongo import MongoClient
from ..config import settings

_client: MongoClient | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGODB_URI)
    return _client


def get_db():
    db = get_client().get_default_database()
    if db is None:
        raise RuntimeError("MONGODB_URI must include a database name in the path")
    return db


# Convenience collection accessors
def telemetry_sessions():
    return get_db()["telemetry_sessions"]


def graph_specs():
    return get_db()["graph_specs"]


def signals():
    return get_db()["signals"]


def stories():
    return get_db()["stories"]


def story_runs():
    return get_db()["story_runs"]


def analysis_angles():
    return get_db()["analysis_angles"]


def car_positions():
    return get_db()["car_positions"]


def circuits():
    return get_db()["circuits"]


def drivers():
    return get_db()["drivers"]


def raw_lap_telemetry():
    return get_db()["raw_lap_telemetry"]
