"""Slim settings — Supabase service-role creds + FastF1 cache dir only.

Mirrors the env precedence of the TS worker (apps/vizf1/worker/src/supabase.ts):
NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL, and
SUPABASE_SERVICE_ROLE_KEY | SUPABASE_SERVICE_KEY.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Load .env from CWD (and the package dir) if present; real env always wins.
load_dotenv()


# Sustained write ceiling for the Supabase sink, bytes/sec. The instance is
# shared with every prod vertical and has a disk-IO burst budget; a race
# positions phase pushes ~15-20 MB of TOASTed JSONB, which drains that budget
# and wedges the whole instance if sent flat out (2026-07-20, 2026-08-24).
# ~1 MB/s spreads that over ~20s. Set to 0 to disable pacing.
_DEFAULT_WRITE_BPS = 1_000_000


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    fastf1_cache_dir: str
    write_bps: float = _DEFAULT_WRITE_BPS


def load_settings() -> Settings:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    cache = os.environ.get("FASTF1_CACHE_DIR", "/tmp/fastf1_cache")

    raw_bps = os.environ.get("VIZF1_INGEST_WRITE_BPS")
    try:
        write_bps = float(raw_bps) if raw_bps else _DEFAULT_WRITE_BPS
    except ValueError:
        raise SystemExit(
            f"vizf1-ingest: VIZF1_INGEST_WRITE_BPS must be a number, got {raw_bps!r}"
        ) from None

    if not url:
        raise SystemExit(
            "vizf1-ingest: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is required"
        )
    if not key:
        raise SystemExit(
            "vizf1-ingest: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is required"
        )
    return Settings(
        supabase_url=url, supabase_key=key, fastf1_cache_dir=cache, write_bps=write_bps,
    )
