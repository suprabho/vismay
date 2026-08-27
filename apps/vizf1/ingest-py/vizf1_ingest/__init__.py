"""VizF1 FastF1 telemetry ingestion worker.

Loads F1 sessions via FastF1, normalizes them, and upserts telemetry into the
shared Supabase project (vizf1_telemetry_* / vizf1_car_positions /
vizf1_lap_telemetry tables — see supabase/vizf1/migrations/004_telemetry.sql).

Ported from the f1_backend donor (f1_backend/AI/app/routes/ingest.py); the pure
FastF1 extraction math is reused verbatim, the Mongo persistence is replaced
with Supabase upserts, and the FastAPI/LLM/Crew layers are dropped.
"""

__all__ = ["__version__"]
__version__ = "0.1.0"
