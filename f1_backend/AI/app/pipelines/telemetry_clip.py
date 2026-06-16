"""
Telemetry clip picker — angle-aware.

Emits a `telemetry_clip` content block describing WHICH lap(s) and WHICH
driver(s) the story's animated player should render. The block is a pure
reference (no telemetry payload inline) — the Backend resolver
(GET /api/telemetry/sessions/:sessionKey/clip) fetches and downsamples the
actual data on demand at render time.

Block shape (matches the new BlockType in Backend/Story.model.ts):

    {
      "type": "telemetry_clip",
      "text": "Optional caption",
      "meta": {
        "sessionKey":         "2024_monaco_R",
        "circuitKey":         "monaco",
        "lapFrom":            12,
        "lapTo":              14,
        "driverNumbers":      [1, 44],
        "focalDriverNumber":  1,
        "channels":           ["speed", "throttle", "brake"],
        "mode":               "fastest_lap" | "lap_window" | "stint",
        "caption":            "Verstappen vs Hamilton — sector 2 attack, laps 12–14",
      }
    }

Why a reference-only block:
  - Stories are stored in Mongo. Embedding raw telemetry inline would bloat docs
    and force re-patches when downsampling parameters change.
  - The Backend already owns the resolver, so the story stays declarative.
  - The Frontend can lazy-load the clip only when the player scrolls into view.
"""

from __future__ import annotations

import logging
from typing import Optional

from ..utils import db_client
from ..utils.grounding import lap_window_from_angle as _lap_window_from_angle

logger = logging.getLogger(__name__)

# Channels picked per angle "mode". The default trio covers most narratives;
# corner / braking-point angles benefit from the extras.
_DEFAULT_CHANNELS = ["speed", "throttle", "brake"]
_DETAIL_CHANNELS  = ["speed", "throttle", "brake", "drs", "nGear", "rpm"]

# Keywords that bias channel selection. Matched against the angle title/focus —
# this is a lightweight signal, not a hard requirement, so a miss falls back to
# the safe default trio.
_DETAIL_KEYWORDS = (
    "shift", "gear", "ers", "deploy", "battery", "engine", "rpm",
    "drs", "braking point", "trail brake", "throttle modulation", "corner exit",
    "kerb", "sector 1", "sector 2", "sector 3", "high-speed", "low-speed",
)


def _session_lap_range(session_key: str) -> Optional[tuple[int, int]]:
    """The full lap range of the session (min/max processed lap). Used as the
    last-resort fallback when an angle has no lapWindow + no signal laps."""
    try:
        doc = db_client.telemetry_sessions().find_one(
            {"sessionKey": session_key},
            {"processedLaps.lap": 1, "_id": 0},
        )
    except Exception:
        return None
    laps = (doc or {}).get("processedLaps") or []
    if not laps:
        return None
    nums = [int(l.get("lap", 0) or 0) for l in laps]
    nums = [n for n in nums if n > 0]
    if not nums:
        return None
    return (min(nums), max(nums))


def _session_leader_driver_number(session_key: str) -> Optional[int]:
    """Return the winner's car number (sessionResults position 1) — used to seed
    a session-scope clip when no focal driver is in scope."""
    try:
        doc = db_client.telemetry_sessions().find_one(
            {"sessionKey": session_key},
            {"sessionResults": 1, "_id": 0},
        )
    except Exception:
        return None
    results = (doc or {}).get("sessionResults") or []
    for r in results:
        if (r or {}).get("position") == 1:
            dn = r.get("driverNumber")
            return int(dn) if isinstance(dn, int) or (isinstance(dn, str) and dn.isdigit()) else None
    return None


def _team_drivers(session_key: str, team_id: str) -> list[int]:
    """The two car numbers of a team in this session."""
    try:
        doc = db_client.telemetry_sessions().find_one(
            {"sessionKey": session_key},
            {"drivers": 1, "_id": 0},
        )
    except Exception:
        return []
    drivers = (doc or {}).get("drivers") or []
    out: list[int] = []
    for d in drivers:
        if d.get("teamId") == team_id and isinstance(d.get("driverNumber"), int):
            out.append(int(d["driverNumber"]))
    return out


def _teammate_driver_number(session_key: str, driver_number: int) -> Optional[int]:
    """Find the teammate of `driver_number` in this session (different car number,
    same teamId). Returns None for solo entrants."""
    try:
        doc = db_client.telemetry_sessions().find_one(
            {"sessionKey": session_key},
            {"drivers": 1, "_id": 0},
        )
    except Exception:
        return None
    drivers = (doc or {}).get("drivers") or []
    focal_team = None
    for d in drivers:
        if d.get("driverNumber") == driver_number:
            focal_team = d.get("teamId")
            break
    if not focal_team:
        return None
    for d in drivers:
        if d.get("teamId") == focal_team and d.get("driverNumber") != driver_number:
            dn = d.get("driverNumber")
            if isinstance(dn, int):
                return dn
    return None


def _channels_for_angle(angle_spec: Optional[dict]) -> list[str]:
    if not angle_spec:
        return list(_DEFAULT_CHANNELS)
    text = " ".join(
        str((angle_spec or {}).get(k) or "") for k in ("title", "focus", "rationale")
    ).lower()
    if any(k in text for k in _DETAIL_KEYWORDS):
        return list(_DETAIL_CHANNELS)
    return list(_DEFAULT_CHANNELS)


def _circuit_key(session_key: str) -> str:
    try:
        doc = db_client.telemetry_sessions().find_one(
            {"sessionKey": session_key}, {"circuitKey": 1, "_id": 0},
        )
    except Exception:
        return ""
    return (doc or {}).get("circuitKey") or ""


def _trim_window_to_session(
    window: tuple[int, int], session_key: str
) -> Optional[tuple[int, int]]:
    """Clamp the angle's lap window to the actual session lap range.

    Why: an angle's lapWindow can drift (e.g. scout proposed laps 1–58 on a
    52-lap race because of a misread). Without clamping the resolver would
    return empty arrays and the player would show nothing. Returns None when
    the window has no overlap with the session at all."""
    rng = _session_lap_range(session_key)
    if not rng:
        return window  # session has no laps, let the resolver decide
    lo, hi = max(window[0], rng[0]), min(window[1], rng[1])
    if hi < lo:
        return None
    return (lo, hi)


def select_telemetry_clip_block(
    session_key: str,
    scope: dict,
    angle_spec: Optional[dict] = None,
    angle_entities: Optional[dict] = None,
) -> Optional[dict]:
    """Pick the telemetry_clip block for one story.

    Returns None when no sensible clip can be constructed (e.g. session has no
    processed laps yet). Never raises — the caller treats None as "skip".

    The returned block is a *reference* — the Backend resolver fetches the
    actual telemetry payload at story-render time.
    """
    try:
        scope = scope or {"kind": "session"}
        kind = scope.get("kind", "session")

        # 1. Lap window — prefer the Angle Scout's authoritative window, fall
        # through to signal-derived laps, then to the full session range. The
        # selector deliberately does NOT pad; the scout/signal helpers already
        # picked the right bounds for the narrative.
        window = _lap_window_from_angle(angle_spec, default=None)
        if not window:
            window = _session_lap_range(session_key)
        if not window:
            logger.info("telemetry_clip: skipped — no resolvable lap range for %s", session_key)
            return None

        window = _trim_window_to_session(window, session_key)
        if not window:
            logger.info("telemetry_clip: skipped — angle window has no overlap with session")
            return None

        lap_from, lap_to = window

        # 2. Driver set per scope.
        driver_numbers: list[int] = []
        focal: Optional[int] = None

        if kind == "driver":
            dn = scope.get("driverNumber")
            if isinstance(dn, int):
                focal = dn
                driver_numbers.append(dn)
            # Include drivers explicitly named in the angle (e.g. "VER vs HAM"
            # inside a driver-scope angle for VER → also pull HAM data).
            for n in (angle_entities or {}).get("driverNumbers") or []:
                if isinstance(n, int) and n not in driver_numbers:
                    driver_numbers.append(n)
            # Otherwise, default to the teammate so the player always has a
            # comparison car on track.
            if len(driver_numbers) == 1 and focal is not None:
                mate = _teammate_driver_number(session_key, focal)
                if mate is not None and mate not in driver_numbers:
                    driver_numbers.append(mate)

        elif kind == "team":
            tid = scope.get("teamId")
            if tid:
                driver_numbers = _team_drivers(session_key, tid)
            if not driver_numbers:
                # Fall back to angle-cited drivers; if nothing, give up.
                for n in (angle_entities or {}).get("driverNumbers") or []:
                    if isinstance(n, int) and n not in driver_numbers:
                        driver_numbers.append(n)
            focal = driver_numbers[0] if driver_numbers else None

        else:  # session
            # Default: the session winner. Plus runner-up if available, to give
            # the master story a head-to-head animation by default.
            leader = _session_leader_driver_number(session_key)
            if leader is not None:
                driver_numbers.append(leader)
                focal = leader
            # Try to find P2 from sessionResults for context.
            try:
                doc = db_client.telemetry_sessions().find_one(
                    {"sessionKey": session_key},
                    {"sessionResults": 1, "_id": 0},
                ) or {}
                for r in doc.get("sessionResults") or []:
                    if (r or {}).get("position") == 2:
                        dn2 = r.get("driverNumber")
                        if isinstance(dn2, int) and dn2 not in driver_numbers:
                            driver_numbers.append(dn2)
                        break
            except Exception:
                pass

        # Cap at 3 — the player UI gets crowded beyond that.
        driver_numbers = driver_numbers[:3]
        if not driver_numbers:
            logger.info("telemetry_clip: skipped — no driver numbers resolved for %s/%s",
                        session_key, kind)
            return None

        channels = _channels_for_angle(angle_spec)
        circuit_key = _circuit_key(session_key)

        # Caption: tie back to the angle so the player's heading reads naturally.
        title = (angle_spec or {}).get("title", "").strip()
        descriptors = ", ".join((angle_entities or {}).get("descriptors") or [])
        if title and descriptors:
            caption = f"{descriptors} — laps {lap_from}–{lap_to}"
        elif title:
            caption = f"{title} — laps {lap_from}–{lap_to}"
        else:
            caption = f"Lap window {lap_from}–{lap_to}"

        # Mode hint — lets the player tighten its initial zoom (single lap → fastest_lap).
        if lap_from == lap_to:
            mode = "fastest_lap"
        elif (lap_to - lap_from) <= 4:
            mode = "lap_window"
        else:
            mode = "stint"

        return {
            "type": "telemetry_clip",
            "text": caption,
            "meta": {
                "sessionKey":        session_key,
                "circuitKey":        circuit_key,
                "lapFrom":           int(lap_from),
                "lapTo":             int(lap_to),
                "driverNumbers":     driver_numbers,
                "focalDriverNumber": focal,
                "channels":          channels,
                "mode":              mode,
                "caption":           caption,
            },
        }

    except Exception as e:
        # Never let clip selection break story generation — the rest of the
        # pipeline (graphs, narrative) is still valuable without it.
        logger.warning("telemetry_clip: selection failed for %s/%s: %s",
                       session_key, (scope or {}).get("kind"), e)
        return None


def insert_clip_block(content_blocks: list[dict], clip: Optional[dict]) -> list[dict]:
    """Splice the clip block into the story content.

    Placement rule: after the FIRST paragraph (so the lede leads, then the clip
    sets the scene), but if the story is already short or already opens with
    headers/quotes, place it after the second block to avoid burying the lede.
    Idempotent — never inserts a second clip if one already exists.
    """
    if not clip:
        return content_blocks
    # Idempotency guard — don't double-insert if a clip is already present
    # (e.g. story re-generation on the same angle).
    for b in content_blocks:
        if isinstance(b, dict) and b.get("type") == "telemetry_clip":
            return content_blocks

    blocks = list(content_blocks)
    if not blocks:
        return [clip]

    # Find the first paragraph block — that's the lede.
    insert_at = 1
    for i, b in enumerate(blocks):
        if isinstance(b, dict) and b.get("type") == "paragraph":
            insert_at = i + 1
            break
    insert_at = min(insert_at, len(blocks))
    blocks.insert(insert_at, clip)
    return blocks
