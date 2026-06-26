"""Supabase service-role sink — replaces the donor's pymongo db_client.

Provides a thin chunked-upsert helper. JSONB-heavy rows (columnar telemetry
blobs) are chunked small so PostgREST request bodies stay well under limits —
mirrors the CHUNK batching in apps/vizf1/worker/src/ingestSessions.ts, but
smaller because each row carries a blob.
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

from supabase import Client, create_client

from .config import Settings

logger = logging.getLogger(__name__)

# Conservative: each telemetry row carries a JSONB blob (tens of KB), so keep
# the batch small enough that the POST body stays modest.
_DEFAULT_CHUNK = 100


class SupabaseSink:
    def __init__(self, settings: Settings) -> None:
        self._client: Client = create_client(settings.supabase_url, settings.supabase_key)

    def upsert(
        self,
        table: str,
        rows: Iterable[dict[str, Any]],
        on_conflict: str,
        chunk: int = _DEFAULT_CHUNK,
    ) -> int:
        """Upsert rows in chunks. Returns the number of rows sent.

        on_conflict is the comma-joined natural key (e.g. "session_key,driver_number,lap")
        so re-runs are idempotent no-ops.
        """
        batch = list(rows)
        if not batch:
            return 0
        sent = 0
        for i in range(0, len(batch), chunk):
            window = batch[i : i + chunk]
            self._client.table(table).upsert(window, on_conflict=on_conflict).execute()
            sent += len(window)
        logger.info("upsert %s: %d rows", table, sent)
        return sent

    def update(self, table: str, match: dict[str, Any], values: dict[str, Any]) -> None:
        """Patch a single row identified by `match` (used for status fields)."""
        q = self._client.table(table).update(values)
        for col, val in match.items():
            q = q.eq(col, val)
        q.execute()
