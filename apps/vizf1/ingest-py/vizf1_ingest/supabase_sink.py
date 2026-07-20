"""Supabase service-role sink — replaces the donor's pymongo db_client.

Provides a thin chunked-upsert helper. JSONB-heavy rows (columnar telemetry
blobs) are chunked small so PostgREST request bodies stay well under limits —
mirrors the CHUNK batching in apps/vizf1/worker/src/ingestSessions.ts, but
smaller because each row carries a blob.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from supabase import Client, create_client

from .config import Settings

logger = logging.getLogger(__name__)

# Conservative: each telemetry row carries a JSONB blob (tens of KB), so keep
# the batch small enough that the POST body stays modest.
_DEFAULT_CHUNK = 100
# Row-count caps alone aren't enough: JSONB row size varies ~30 KB for a race
# lap up to ~280 KB for a garage-spanning quali "lap" (2026 Belgian Q), so 100
# rows can mean a 3 MB POST or a 6+ MB one — and the big ones blow Postgres'
# statement timeout and can wedge the shared instance. Cap accumulated payload
# per request as well.
_DEFAULT_MAX_BYTES = 1_500_000


def _row_bytes(row: dict[str, Any]) -> int:
    return len(json.dumps(row, default=str))


class SupabaseSink:
    def __init__(self, settings: Settings) -> None:
        self._client: Client = create_client(settings.supabase_url, settings.supabase_key)

    def upsert(
        self,
        table: str,
        rows: Iterable[dict[str, Any]],
        on_conflict: str,
        chunk: int = _DEFAULT_CHUNK,
        max_bytes: int = _DEFAULT_MAX_BYTES,
    ) -> int:
        """Upsert rows in chunks capped by row count AND payload size.

        Returns the number of rows sent. A single row larger than max_bytes is
        sent alone. on_conflict is the comma-joined natural key (e.g.
        "session_key,driver_number,lap") so re-runs are idempotent no-ops.
        """
        batch = list(rows)
        if not batch:
            return 0
        sent = 0
        requests = 0
        window: list[dict[str, Any]] = []
        window_bytes = 0
        for row in batch:
            size = _row_bytes(row)
            if window and (len(window) >= chunk or window_bytes + size > max_bytes):
                self._client.table(table).upsert(window, on_conflict=on_conflict).execute()
                sent += len(window)
                requests += 1
                window, window_bytes = [], 0
            window.append(row)
            window_bytes += size
        self._client.table(table).upsert(window, on_conflict=on_conflict).execute()
        sent += len(window)
        requests += 1
        logger.info("upsert %s: %d rows in %d request(s)", table, sent, requests)
        return sent

    def update(self, table: str, match: dict[str, Any], values: dict[str, Any]) -> None:
        """Patch a single row identified by `match` (used for status fields)."""
        q = self._client.table(table).update(values)
        for col, val in match.items():
            q = q.eq(col, val)
        q.execute()

    def fetch_rows(self, table: str, columns: str, match: dict[str, Any]) -> list[dict[str, Any]]:
        """Select `columns` from rows matching all `match` equalities.

        Sized for small metadata reads (e.g. one season's ~100 rows in
        vizf1_telemetry_sessions) — no pagination, so don't point it at the
        blob tables.
        """
        q = self._client.table(table).select(columns)
        for col, val in match.items():
            q = q.eq(col, val)
        return q.execute().data or []
