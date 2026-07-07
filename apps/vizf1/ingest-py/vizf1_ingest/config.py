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


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    fastf1_cache_dir: str


def load_settings() -> Settings:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    cache = os.environ.get("FASTF1_CACHE_DIR", "/tmp/fastf1_cache")

    if not url:
        raise SystemExit(
            "vizf1-ingest: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is required"
        )
    if not key:
        raise SystemExit(
            "vizf1-ingest: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is required"
        )
    return Settings(supabase_url=url, supabase_key=key, fastf1_cache_dir=cache)
