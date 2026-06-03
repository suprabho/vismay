"""Resilient Backend I/O for the AI worker.

Centralises three things every pipeline needs but previously re-implemented
inconsistently:
  * numpy-safe JSON serialization (np.int64/np.float64/ndarray would otherwise
    make stdlib json — used by httpx ``json=`` — throw at POST time);
  * retry with exponential backoff + jitter on transient HTTP failures;
  * bulk POST helpers for the new /api/signals/bulk and /api/graphs/bulk routes.
"""

from __future__ import annotations

import logging
import random
import time
from typing import Any

import httpx
import numpy as np

from ..config import settings

logger = logging.getLogger("apex.ai.http")

# Status codes worth retrying (transient). 4xx other than 429 are not retried.
_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


def to_jsonable(obj: Any) -> Any:
    """Recursively convert numpy / non-JSON-native values into plain Python."""
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        f = float(obj)
        return f if np.isfinite(f) else None
    if isinstance(obj, np.ndarray):
        return to_jsonable(obj.tolist())
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, float):
        # Mongo/JSON reject NaN/Inf — coerce to null.
        return obj if obj == obj and obj not in (float("inf"), float("-inf")) else None
    return obj


def _headers() -> dict:
    return {"X-Worker-Secret": settings.AI_WORKER_SECRET}


def _request(method: str, path: str, data: dict) -> dict:
    """Issue one HTTP request with retry/backoff. Raises on final failure."""
    url = f"{settings.BACKEND_API_URL}{path}"
    payload = to_jsonable(data)
    attempts = max(1, settings.HTTP_MAX_RETRIES)
    last_exc: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            r = httpx.request(
                method, url, json=payload,
                headers=_headers(), timeout=settings.HTTP_TIMEOUT_SEC,
            )
            if r.status_code in _RETRYABLE_STATUS and attempt < attempts:
                raise httpx.HTTPStatusError(
                    f"retryable {r.status_code}", request=r.request, response=r,
                )
            if r.status_code >= 400:
                logger.warning("%s %s -> %d body=%s", method, path, r.status_code, r.text[:300])
            r.raise_for_status()
            return r.json() if r.content else {}
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if attempt >= attempts:
                break
            backoff = settings.HTTP_BACKOFF_BASE_SEC * (2 ** (attempt - 1))
            backoff += random.uniform(0, backoff * 0.25)  # jitter
            logger.info("%s %s attempt %d/%d failed (%s); retrying in %.2fs",
                        method, path, attempt, attempts, exc, backoff)
            time.sleep(backoff)

    assert last_exc is not None
    raise last_exc


def backend_post(path: str, data: dict) -> dict:
    return _request("POST", path, data)


def backend_patch(path: str, data: dict) -> dict:
    return _request("PATCH", path, data)


def backend_post_bulk(path: str, items: list[dict], *, sessionKey: str | None = None,
                      replaceExisting: bool = False, key: str = "items") -> dict:
    """POST a list of docs to a bulk endpoint. ``key`` is the body field name
    the endpoint expects (e.g. 'signals' or 'graphs'). No-ops on an empty list."""
    if not items:
        return {"inserted": 0, "ids": []}
    body: dict = {key: items, "replaceExisting": replaceExisting}
    if sessionKey:
        body["sessionKey"] = sessionKey
    return _request("POST", path, body)
