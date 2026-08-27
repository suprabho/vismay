"""Minimal OpenF1 REST client — the fallback data source when FastF1's
live-timing upstream is unreachable (Cloudflare rejects most datacenter IPs,
so scheduled GitHub runners draw a blocked-IP lottery; see README).

Python port of apps/vizf1/worker/src/openf1.ts semantics:
  - serialized requests with a fixed spacing (free tier allows 3 req/s AND
    30 req/min — the per-minute cap is the binding one, so space ~2.1s),
  - exponential backoff with jitter on 429/5xx and connection errors,
  - other 4xx are fatal,
  - OpenF1 returns 404 (or {"detail": ...}) instead of [] when an endpoint
    has no rows — normalize that to an empty list where absence is expected.

Historical data is free and unauthenticated; only real-time requires a paid
account. Data exists from 2023 onwards.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import random
import time
from typing import Any, Iterator

import requests

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.openf1.org/v1"
# 30 requests/minute is the free-tier ceiling; 2.1s spacing keeps a long
# session fetch just under it (and trivially satisfies the 3 req/s cap).
REQUEST_SPACING_S = 2.1
MAX_RETRIES = 8
USER_AGENT = "VizF1/1.0 (+https://vizf1.app)"
# /car_data and /location responses for a whole session are too large for one
# request — window them (a 30-min window at ~3.7 Hz is ~6.6k samples).
WINDOW_MINUTES = 30


class OpenF1Error(RuntimeError):
    """A non-retryable OpenF1 request failure (or retries exhausted)."""


def parse_openf1_date(value: str) -> dt.datetime:
    """OpenF1 ISO timestamp -> aware UTC datetime (naive values are UTC)."""
    parsed = dt.datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def iter_windows(
    start: dt.datetime, end: dt.datetime, width: dt.timedelta | None = None
) -> Iterator[tuple[dt.datetime, dt.datetime]]:
    """Half-open [from, to) windows covering [start, end]."""
    width = width or dt.timedelta(minutes=WINDOW_MINUTES)
    cursor = start
    while cursor < end:
        nxt = min(cursor + width, end)
        yield cursor, nxt
        cursor = nxt


class OpenF1Client:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or os.environ.get("OPENF1_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._session = requests.Session()
        self._session.headers["User-Agent"] = USER_AGENT
        self._last_request = 0.0

    # ── transport ────────────────────────────────────────────────────────────
    def _wait_slot(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < REQUEST_SPACING_S:
            time.sleep(REQUEST_SPACING_S - elapsed)
        self._last_request = time.monotonic()

    def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        treat_404_as_empty: bool = False,
        raw_filters: list[str] | None = None,
    ) -> list[dict]:
        """GET one endpoint; returns the JSON array.

        `raw_filters` are appended to the query string VERBATIM (e.g.
        "date>=2025-11-22T04:00:00"): OpenF1's filter syntax puts the operator
        inside the parameter name, and its parser 500s when a client
        percent-encodes that operator the way requests' params dict does —
        mirror the worker client's template-string URLs instead.
        """
        query = "&".join(
            [f"{k}={v}" for k, v in (params or {}).items()] + list(raw_filters or [])
        )
        url = f"{self._base_url}/{path.lstrip('/')}" + (f"?{query}" if query else "")
        last_err: str = "no attempts made"
        for attempt in range(MAX_RETRIES + 1):
            self._wait_slot()
            try:
                resp = self._session.get(url, timeout=60)
            except requests.RequestException as exc:
                last_err = f"connection error: {exc}"
            else:
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        return data
                    # Some endpoints answer 200 + {"detail": "..."} for no rows.
                    if isinstance(data, dict) and treat_404_as_empty:
                        return []
                    raise OpenF1Error(f"unexpected payload from {path}: {str(data)[:200]}")
                if resp.status_code == 404 and treat_404_as_empty:
                    return []
                if resp.status_code == 429 or resp.status_code >= 500:
                    retry_after = resp.headers.get("Retry-After")
                    last_err = f"HTTP {resp.status_code}"
                    if retry_after:
                        try:
                            time.sleep(min(float(retry_after), 60.0))
                        except ValueError:
                            pass
                else:
                    raise OpenF1Error(f"OpenF1 {path} failed: HTTP {resp.status_code} {resp.text[:200]}")
            if attempt < MAX_RETRIES:
                # 1s, 2s, 4s ... ±20% jitter — mirrors the worker client.
                delay = (2 ** attempt) * (1 + random.uniform(-0.2, 0.2))
                logger.debug("OpenF1 %s retry %d/%d after %s (%.1fs)", path, attempt + 1, MAX_RETRIES, last_err, delay)
                time.sleep(delay)
        raise OpenF1Error(f"OpenF1 {path} failed after {MAX_RETRIES} retries: {last_err}")

    # ── typed helpers ────────────────────────────────────────────────────────
    def sessions(self, year: int) -> list[dict]:
        return self.get("sessions", {"year": year})

    def drivers(self, session_key: int) -> list[dict]:
        return self.get("drivers", {"session_key": session_key})

    def laps(self, session_key: int) -> list[dict]:
        return self.get("laps", {"session_key": session_key}, treat_404_as_empty=True)

    def stints(self, session_key: int) -> list[dict]:
        return self.get("stints", {"session_key": session_key}, treat_404_as_empty=True)

    def pit(self, session_key: int) -> list[dict]:
        return self.get("pit", {"session_key": session_key}, treat_404_as_empty=True)

    def race_control(self, session_key: int) -> list[dict]:
        return self.get("race_control", {"session_key": session_key}, treat_404_as_empty=True)

    def weather(self, session_key: int) -> list[dict]:
        return self.get("weather", {"session_key": session_key}, treat_404_as_empty=True)

    def session_result(self, session_key: int) -> list[dict]:
        return self.get("session_result", {"session_key": session_key}, treat_404_as_empty=True)

    def starting_grid(self, session_key: int) -> list[dict]:
        return self.get("starting_grid", {"session_key": session_key}, treat_404_as_empty=True)

    def position(self, session_key: int, driver_number: int | None = None) -> list[dict]:
        params: dict[str, Any] = {"session_key": session_key}
        if driver_number is not None:
            params["driver_number"] = driver_number
        return self.get("position", params, treat_404_as_empty=True)

    def _windowed(
        self,
        path: str,
        session_key: int,
        driver_number: int,
        start: dt.datetime,
        end: dt.datetime,
    ) -> list[dict]:
        def _naive_utc(ts: dt.datetime) -> str:
            # OpenF1 treats naive timestamps as UTC; a "+00:00" offset would
            # need encoding the '+', which its parser mishandles — omit it.
            return ts.astimezone(dt.timezone.utc).replace(tzinfo=None).isoformat()

        out: list[dict] = []
        for w_from, w_to in iter_windows(start, end):
            out.extend(self.get(
                path,
                {"session_key": session_key, "driver_number": driver_number},
                treat_404_as_empty=True,
                raw_filters=[f"date>={_naive_utc(w_from)}", f"date<{_naive_utc(w_to)}"],
            ))
        # Windows are half-open so duplicates shouldn't occur, but the API has
        # been seen repeating boundary samples — dedupe by timestamp.
        seen: set[str] = set()
        unique: list[dict] = []
        for row in sorted(out, key=lambda r: r.get("date") or ""):
            date = row.get("date")
            if not date or date in seen:
                continue
            seen.add(date)
            unique.append(row)
        return unique

    def car_data(self, session_key: int, driver_number: int, start: dt.datetime, end: dt.datetime) -> list[dict]:
        """~3.7 Hz speed/rpm/n_gear/throttle/brake/drs samples in [start, end)."""
        return self._windowed("car_data", session_key, driver_number, start, end)

    def location(self, session_key: int, driver_number: int, start: dt.datetime, end: dt.datetime) -> list[dict]:
        """~3.7 Hz x/y/z samples in [start, end) (same 0.1m frame as FastF1 pos data)."""
        return self._windowed("location", session_key, driver_number, start, end)
