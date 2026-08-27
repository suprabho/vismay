"""Supabase service-role sink — replaces the donor's pymongo db_client.

Provides a thin chunked-upsert helper. JSONB-heavy rows (columnar telemetry
blobs) are chunked small so PostgREST request bodies stay well under limits —
mirrors the CHUNK batching in apps/vizf1/worker/src/ingestSessions.ts, but
smaller because each row carries a blob.

Two guardrails protect the *shared* Supabase instance (it serves every prod
vertical, so a heavy write path here can take everything down):

* a per-request size cap, so no single statement blows Postgres' timeout, and
* a sustained bytes/sec throttle, so a long run of legal-but-large requests
  can't drain the instance's disk-IO burst budget.

Plus a latching circuit breaker: once the instance stops answering, we STOP.
Retrying into a wedged instance is what turns a 15-minute outage into an hour.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Iterable, TypeVar

from supabase import Client, create_client

from .config import Settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Conservative: each telemetry row carries a JSONB blob (tens of KB), so keep
# the batch small enough that the POST body stays modest.
_DEFAULT_CHUNK = 100
# Row-count caps alone aren't enough: JSONB row size varies ~30 KB for a race
# lap up to ~280 KB for a garage-spanning quali "lap" (2026 Belgian Q), so 100
# rows can mean a 3 MB POST or a 6+ MB one — and the big ones blow Postgres'
# statement timeout and can wedge the shared instance. Cap accumulated payload
# per request as well.
_DEFAULT_MAX_BYTES = 1_500_000

# Consecutive failed requests before we latch and give up on the instance. Two,
# not "a few": the runbook is stop-and-wait, and blob writes keep failing for
# ~1h after a wedge, so extra attempts only extend the outage.
_FAILURE_LIMIT = 2


class SinkUnavailable(RuntimeError):
    """The Supabase instance stopped answering; the sink has latched shut.

    Raised in place of every subsequent write so callers abort the run instead
    of pushing more load into a degraded instance. Deliberately NOT a subclass
    of the per-phase errors ingest.py tolerates — it must escape those handlers.
    """


def _row_bytes(row: dict[str, Any]) -> int:
    return len(json.dumps(row, default=str))


class SupabaseSink:
    def __init__(self, settings: Settings) -> None:
        self._client: Client = create_client(settings.supabase_url, settings.supabase_key)
        self._write_bps = settings.write_bps
        # Monotonic timestamp before which the next write must not be sent.
        self._next_send_at = 0.0
        self._consecutive_failures = 0
        self.unavailable = False

    # ── guardrails ──────────────────────────────────────────────────────────
    def _throttle(self, size: int) -> float:
        """Pace writes so sustained throughput stays under write_bps.

        Sleeps off the debt owed for the *previous* request, then books the
        debt for this one. Returns seconds slept (for run accounting).
        """
        if self._write_bps <= 0:  # 0/negative disables pacing
            return 0.0
        slept = 0.0
        wait = self._next_send_at - time.monotonic()
        if wait > 0:
            time.sleep(wait)
            slept = wait
        self._next_send_at = time.monotonic() + size / self._write_bps
        return slept

    def _guard(self) -> None:
        if self.unavailable:
            raise SinkUnavailable(
                "Supabase sink latched shut after "
                f"{_FAILURE_LIMIT} consecutive failures — refusing further writes"
            )

    def _execute(self, what: str, fn: Callable[[], T], resets: bool = False) -> T:
        """Run one PostgREST request, tracking consecutive failures.

        Below the limit the original exception propagates unchanged (callers'
        per-phase handlers still see the real error). At the limit we latch and
        raise SinkUnavailable so the whole run aborts.

        `resets` — whether success here clears the failure count. Only true for
        upserts. A starved instance keeps serving small writes while blob writes
        time out (2026-07-20), so letting an advisory status `update` reset the
        count would mean the breaker never latches in the exact scenario it
        exists for.
        """
        self._guard()
        try:
            result = fn()
        except Exception as exc:  # noqa: BLE001 — re-raised below
            self._consecutive_failures += 1
            logger.error(
                "%s failed (%d/%d consecutive): %s",
                what, self._consecutive_failures, _FAILURE_LIMIT, exc,
            )
            if self._consecutive_failures >= _FAILURE_LIMIT:
                self.unavailable = True
                raise SinkUnavailable(
                    f"{what} failed {self._consecutive_failures}x consecutively; "
                    "instance looks unresponsive — aborting run rather than "
                    f"retrying (last error: {exc})"
                ) from exc
            raise
        if resets:
            self._consecutive_failures = 0
        return result

    # ── writes ──────────────────────────────────────────────────────────────
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
        sent alone (the cap cannot split one row — that case is logged).
        on_conflict is the comma-joined natural key (e.g.
        "session_key,driver_number,lap") so re-runs are idempotent no-ops.
        """
        self._guard()
        batch = list(rows)
        if not batch:
            return 0
        sent = 0
        requests = 0
        total_bytes = 0
        slept = 0.0
        window: list[dict[str, Any]] = []
        window_bytes = 0

        def flush() -> None:
            nonlocal sent, requests, slept, total_bytes
            slept += self._throttle(window_bytes)
            self._execute(
                f"upsert {table} ({len(window)} rows, {window_bytes} B)",
                lambda: self._client.table(table).upsert(window, on_conflict=on_conflict).execute(),
                resets=True,
            )
            sent += len(window)
            requests += 1
            total_bytes += window_bytes

        for row in batch:
            size = _row_bytes(row)
            if size > max_bytes:
                # Can't be split here — the byte cap is inert for this row. Worth
                # seeing in the log, since oversized single rows are exactly what
                # blows the statement timeout.
                logger.warning(
                    "%s: single row is %d B (> max_bytes %d) and cannot be split; "
                    "sending whole", table, size, max_bytes,
                )
            if window and (len(window) >= chunk or window_bytes + size > max_bytes):
                flush()
                window, window_bytes = [], 0
            window.append(row)
            window_bytes += size
        flush()
        logger.info(
            "upsert %s: %d rows in %d request(s), %.1f MB, %.1fs paced",
            table, sent, requests, total_bytes / 1e6, slept,
        )
        return sent

    def update(self, table: str, match: dict[str, Any], values: dict[str, Any]) -> None:
        """Patch a single row identified by `match` (used for status fields)."""
        self._guard()
        q = self._client.table(table).update(values)
        for col, val in match.items():
            q = q.eq(col, val)
        self._throttle(_row_bytes(values))
        self._execute(f"update {table}", q.execute)

    def fetch_rows(self, table: str, columns: str, match: dict[str, Any]) -> list[dict[str, Any]]:
        """Select `columns` from rows matching all `match` equalities.

        Sized for small metadata reads (e.g. one season's ~100 rows in
        vizf1_telemetry_sessions) — no pagination, so don't point it at the
        blob tables.
        """
        q = self._client.table(table).select(columns)
        for col, val in match.items():
            q = q.eq(col, val)
        return self._execute(f"select {table}", q.execute).data or []
