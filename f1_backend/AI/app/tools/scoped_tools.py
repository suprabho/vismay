"""
Scope-bound CrewAI tools.

Each crew run materialises a (sessionKey, scope, lap_window) and produces a set
of closure-bound tools that *cannot* be widened by the LLM. The agent never
sees a `driver_number` or `start_lap` argument it could omit or change — the
filters are baked in. This is the layer that guarantees driver/team crews only
read the slice relevant to their angle.

Three tools are produced:

  • read_scoped_laps         — processedLaps for the focal driver/team, windowed.
  • scope_context_pack       — one-shot digest: focal + teammate + leader laps,
                               stints, aggregates and signals. Replaces 4-5
                               separate tool calls.
  • read_lap_telemetry_trace — per-frame raw_lap_telemetry for ONE lap, with a
                               channel allowlist and a hard window guard.

Callers should also pass the corresponding `lap_window` into prompts as a
documentation hint, but the tool guards are the source of truth.
"""

from __future__ import annotations

import json
from bson import ObjectId
from crewai.tools import tool

from ..utils import db_client
from .stats_tool import (
    compute_tire_degradation_impl,
    compute_lap_percentile_impl,
    compute_gap_between_drivers_impl,
    session_lap_summary_impl,
)


# ── JSON helpers ──────────────────────────────────────────────────────────────

class _JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        return super().default(obj)


def _dumps(obj) -> str:
    return json.dumps(obj, cls=_JSONEncoder, default=str)


# Channels the raw telemetry tool will expose. Anything outside this set is
# either unavailable in Fast-F1's public feed or large enough to blow the
# context window.
_ALLOWED_TRACE_CHANNELS = {
    "speed", "throttle", "brake", "drs", "nGear",
    "rpm", "distance", "distanceToAhead", "z",
}

# Fields of telemetry_sessions that the scoped tools will project. Anything not
# listed is dropped before the doc reaches the LLM — keeps weather arrays,
# session metadata, and other heavy fields out of the prompt budget.
_LAPS_PROJECTION = {
    "processedLaps": 1, "drivers": 1, "sessionResults": 1, "_id": 0,
}
_CONTEXT_PROJECTION = {
    "drivers": 1, "sessionResults": 1, "stints": 1, "processedLaps": 1,
    "lapTelemetryAggregates": 1, "_id": 0,
}

# Per-record field allowlists. Anything outside these gets dropped before the
# slice is JSON-encoded — keeps the LLM context budget on signal, not noise.
_LAP_KEEP = (
    "driverNumber", "lap", "lapTimeSec", "sectors", "compound",
    "stintLap", "tyreLife", "freshTyre", "events", "isRepresentative",
)
_AGG_KEEP = (
    "driverNumber", "lap", "avgSpeed", "maxSpeed", "avgThrottlePct",
    "brakingEvents", "drsActivations", "topGear", "lapDistanceM",
    "sector1MaxSpeed", "sector2MaxSpeed", "sector3MaxSpeed",
    "avgGapToAheadM", "minGapToAheadM",
)
_STINT_KEEP = (
    "driverNumber", "stintNumber", "compound", "startLap", "endLap",
    "totalLaps", "pitInLap", "pitOutLap", "pitDeltaSec", "averageDegPerLap",
)
_RESULT_KEEP = (
    "driverNumber", "abbreviation", "gridPosition", "position",
    "classifiedPosition", "points", "status", "dnf", "dnfReason",
    "timeSec", "laps",
)
_SIGNAL_KEEP = (
    "id", "kind", "title", "summary", "severity", "priority",
    "driverNumber", "teamId", "teamName", "scopeKind",
    "lap", "startLap", "endLap", "metrics",
)


def _project(d: dict, keep: tuple[str, ...]) -> dict:
    """Project a dict to an allowlist of keys, dropping the rest."""
    return {k: d[k] for k in keep if k in d}


def _resolve_team_id(scope: dict, drivers_roster: list[dict]) -> str | None:
    """Best-effort teamId resolution for a driver scope (so team-scope
    comparison still works even when only driverNumber is provided)."""
    tid = scope.get("teamId")
    if tid:
        return tid
    dn = scope.get("driverNumber")
    if dn is None:
        return None
    for d in drivers_roster:
        if d.get("driverNumber") == dn:
            return d.get("teamId")
    return None


def materialize_context_slice(
    session_key: str,
    scope: dict,
    lap_window: tuple[int, int] | None = None,
    extra_driver_numbers: list[int] | None = None,
    include_leader: bool = False,
) -> dict:
    """Build the same digest `scope_context_pack` exposes, but as a plain dict.

    Reused by the post-crew claim verifier so the check runs against the
    EXACT same slice the analyst saw. Pure data — no LLM dependencies.

    `extra_driver_numbers` augments the keep-set with drivers the angle
    explicitly cites (e.g. an angle titled "Antonelli vs. Russell" on a
    Verstappen driver-scope still needs both Antonelli and Russell in the
    slice). Resolved upstream by `resolve_angle_entities`.

    `include_leader` — only set when the angle's text actually invites a
    leader/podium comparison (per `angle_invites_leader_comparison`). When
    False (default), the leader's lap data is NOT in the slice; instead, a
    small `baseline` block exposes the leader's fastest lap time only, so the
    analyst can anchor a single pace baseline without drifting into a grid-wide
    narrative.
    """
    dn = scope.get("driverNumber")
    tid_hint = scope.get("teamId")
    lo, hi = lap_window if lap_window else (0, 10_000)

    doc = db_client.telemetry_sessions().find_one(
        {"sessionKey": session_key}, _CONTEXT_PROJECTION,
    ) or {}
    roster = doc.get("drivers", []) or []
    results = doc.get("sessionResults", []) or []
    focal_team = _resolve_team_id(scope, roster)

    teammate_dn = None
    if focal_team and dn is not None:
        for d in roster:
            if d.get("teamId") == focal_team and d.get("driverNumber") != dn:
                teammate_dn = d.get("driverNumber")
                break

    def _rank(r):
        return int(r.get("position") or r.get("classifiedPosition") or 99)
    leader_dn = None
    if results:
        leader = sorted(results, key=_rank)[0]
        leader_dn = leader.get("driverNumber")

    if dn is not None:
        focal_dns = {dn}
    elif tid_hint:
        focal_dns = {
            d.get("driverNumber") for d in roster
            if d.get("teamId") == tid_hint
        }
    else:
        focal_dns = {d.get("driverNumber") for d in roster}

    keep = set(focal_dns)
    if teammate_dn is not None:
        keep.add(teammate_dn)
    # CRITICAL: leader is only in the slice when the angle text invites it OR
    # the angle explicitly cites the leader (covered by extra_driver_numbers).
    # The old unconditional `keep.add(leader_dn)` was the single biggest reason
    # angle-driven narratives drifted into grid-wide commentary.
    if include_leader and leader_dn is not None:
        keep.add(leader_dn)
    if extra_driver_numbers:
        for n in extra_driver_numbers:
            if isinstance(n, int):
                keep.add(n)

    def _windowed(coll, lap_field="lap"):
        return [
            x for x in coll
            if x.get("driverNumber") in keep
            and lo <= int(x.get(lap_field, 0) or 0) <= hi
        ]

    # Project to allow-listed fields so we don't ship `weather`-style blobs or
    # other heavy nested data the analyst never reads.
    laps_raw = _windowed(doc.get("processedLaps", []) or [])
    aggs_raw = _windowed(doc.get("lapTelemetryAggregates", []) or [])
    stints_raw = [
        s for s in (doc.get("stints", []) or [])
        if s.get("driverNumber") in keep
    ]

    # Hard cap on lap rows to keep the context budget bounded. A 70-lap race ×
    # 3 drivers fits comfortably; longer races / wider focus get truncated and
    # tagged so the caller can see what happened. Sort to keep the densest /
    # most recent laps for narrative purposes.
    _LAP_ROW_CAP = 240
    laps_truncated = False
    if len(laps_raw) > _LAP_ROW_CAP:
        laps_raw = sorted(laps_raw, key=lambda l: (l.get("driverNumber") or 0, l.get("lap") or 0))[:_LAP_ROW_CAP]
        laps_truncated = True
    if len(aggs_raw) > _LAP_ROW_CAP:
        aggs_raw = sorted(aggs_raw, key=lambda a: (a.get("driverNumber") or 0, a.get("lap") or 0))[:_LAP_ROW_CAP]

    laps   = [_project(l, _LAP_KEEP)   for l in laps_raw]
    aggs   = [_project(a, _AGG_KEEP)   for a in aggs_raw]
    stints = [_project(s, _STINT_KEEP) for s in stints_raw]

    sig_q: dict = {"sessionKey": session_key}
    if dn is not None:
        sig_q["driverNumber"] = dn
    elif tid_hint:
        sig_q["teamId"] = tid_hint
    sig_proj = {k: 1 for k in _SIGNAL_KEEP if k != "id"}
    sig_proj["_id"] = 1
    sigs = list(db_client.signals().find(sig_q, sig_proj))
    for s in sigs:
        s["id"] = str(s.pop("_id", ""))

    def _in_window(s):
        for key in ("lap", "startLap", "endLap"):
            v = s.get(key)
            if isinstance(v, int) and lo <= v <= hi:
                return True
        return not any(isinstance(s.get(k), int) for k in ("lap", "startLap", "endLap"))
    sigs = [_project(s, _SIGNAL_KEEP) for s in sigs if _in_window(s)]

    def _slim(d):
        return {
            "driverNumber": d.get("driverNumber"),
            "abbreviation": d.get("abbreviation"),
            "fullName":     d.get("fullName"),
            "teamId":       d.get("teamId"),
            "teamName":     d.get("teamName"),
        }

    focal_results = [_project(r, _RESULT_KEEP) for r in results if r.get("driverNumber") in keep]

    # Baseline anchor: when the leader isn't in the slice, surface just their
    # fastest-lap time so the analyst can write "the focal driver was 0.4s off
    # the leader's best" without dragging the leader's full data into scope.
    baseline: dict | None = None
    if not include_leader and leader_dn is not None and leader_dn not in keep:
        leader_laps_raw = doc.get("processedLaps", []) or []
        leader_times = [
            float(l.get("lapTimeSec") or 0)
            for l in leader_laps_raw
            if l.get("driverNumber") == leader_dn
            and isinstance(l.get("lapTimeSec"), (int, float))
            and float(l.get("lapTimeSec")) > 0
            and (not lap_window or lo <= int(l.get("lap", 0) or 0) <= hi)
        ]
        if leader_times:
            leader_doc = next(
                (d for d in roster if d.get("driverNumber") == leader_dn), {}
            )
            baseline = {
                "leaderDriverNumber":  leader_dn,
                "leaderAbbreviation":  leader_doc.get("abbreviation"),
                "leaderFastestLapSec": round(min(leader_times), 3),
                "note": (
                    "Reference only. Use sparingly to anchor ONE pace baseline. "
                    "The leader is NOT a comparison subject for this story."
                ),
            }

    out = {
        "sessionKey":           session_key,
        "scope":                scope,
        "lapWindow":            [lo, hi],
        "focalDriverNumber":    dn,
        "focalTeamId":          focal_team or tid_hint,
        "teammateDriverNumber": teammate_dn,
        "leaderDriverNumber":   leader_dn if include_leader else None,
        # All driver numbers whose data is in this slice — focal + team-mate +
        # any angle-cited extras (+ leader only when include_leader=True).
        # Matches the FOCUS LOCK enforced by the focal_* tools.
        "sliceDriverNumbers":   sorted(n for n in keep if isinstance(n, int)),
        "roster":               [_slim(d) for d in roster if d.get("driverNumber") in keep],
        "sessionResults":       focal_results,
        "laps":                 laps,
        "aggregates":           aggs,
        "stints":               stints,
        "signals":              sigs,
    }
    if baseline is not None:
        out["baseline"] = baseline
    if laps_truncated:
        out["truncated"] = {
            "reason": "lap-row cap",
            "cap":    _LAP_ROW_CAP,
            "kept":   len(laps),
        }
    return out


def build_scoped_tools(
    session_key: str,
    scope: dict,
    lap_window: tuple[int, int] | None = None,
    extra_driver_numbers: list[int] | None = None,
    include_leader: bool = False,
) -> list:
    """Factory returning closure-bound CrewAI tools. Bind once per crew run.

    Args:
        session_key: e.g. "2024_monaco_R".
        scope: {kind, driverNumber?, teamId?, teamName?, driverName?}.
        lap_window: inclusive (lo, hi) lap range. If None, the tools cover the
                    full session (used by the session-scope crew).
        extra_driver_numbers: additional drivers the angle explicitly cites
                    (resolved by `resolve_angle_entities`). Their laps are
                    included in the slice so the crew can ground the comparison
                    the angle is actually asking for.
        include_leader: only True when the angle's text explicitly invites a
                    leader/podium comparison. Default False keeps the leader's
                    data out of the slice so the narrative doesn't drift into
                    "meanwhile, at the front of the field..." tangents — the
                    leader's fastest lap is still surfaced via `baseline` as a
                    reference-only stat.
    """
    dn = scope.get("driverNumber")
    tid_hint = scope.get("teamId")
    lo, hi = lap_window if lap_window else (0, 10_000)
    extra_dns = {int(n) for n in (extra_driver_numbers or []) if isinstance(n, int)}

    # Resolve the full focus set ONCE so every tool below can validate without
    # re-querying. For driver scope the team-mate is included implicitly; for
    # team scope, every driver on the team. extra_dns covers angle-cited
    # drivers from OTHER teams (e.g. "VER vs HAM" on a Verstappen scope).
    _focus_doc = db_client.telemetry_sessions().find_one(
        {"sessionKey": session_key}, {"drivers": 1, "_id": 0},
    ) or {}
    _roster = _focus_doc.get("drivers", []) or []
    _team_dns: set[int] = set()
    if dn is None and tid_hint:
        _team_dns = {
            d.get("driverNumber") for d in _roster
            if d.get("teamId") == tid_hint and isinstance(d.get("driverNumber"), int)
        }
    elif dn is not None:
        focal_team = next(
            (d.get("teamId") for d in _roster if d.get("driverNumber") == dn),
            None,
        )
        if focal_team:
            _team_dns = {
                d.get("driverNumber") for d in _roster
                if d.get("teamId") == focal_team and isinstance(d.get("driverNumber"), int)
            }

    focus_dns: set[int] = set(extra_dns) | set(_team_dns)
    if dn is not None:
        focus_dns.add(dn)

    # When the angle invites a leader comparison, allow the leader as a valid
    # comparison target in the focal_* tools (otherwise `focal_gap` would
    # reject it). The leader is resolved lazily from sessionResults.
    if include_leader:
        try:
            _res = (db_client.telemetry_sessions().find_one(
                {"sessionKey": session_key}, {"sessionResults": 1, "_id": 0}
            ) or {}).get("sessionResults", []) or []
            if _res:
                _leader = sorted(
                    _res,
                    key=lambda r: int(r.get("position") or r.get("classifiedPosition") or 99),
                )[0]
                _ldn = _leader.get("driverNumber")
                if isinstance(_ldn, int):
                    focus_dns.add(_ldn)
        except Exception:
            pass

    def _in_focus(driver_num: int) -> bool:
        if scope.get("kind") == "session" and not focus_dns:
            return True
        return int(driver_num) in focus_dns

    def _focus_err() -> str:
        if scope.get("kind") == "session" and not focus_dns:
            return _dumps({"error": "No data found for the requested drivers."})
        return _dumps({
            "error": "driver outside this story's focus set",
            "allowed": sorted(focus_dns),
        })

    # ── read_scoped_laps ──────────────────────────────────────────────────

    @tool("read_scoped_laps")
    def read_scoped_laps() -> str:
        """Return processedLaps for THIS story's driver/team (plus any drivers
        explicitly cited in the angle title/focus) within the angle's lap
        window. Also returns drivers roster and sessionResults so the analyst
        can reference grid positions and abbreviations. Filters are enforced
        server-side — there is no way to widen them."""
        doc = db_client.telemetry_sessions().find_one(
            {"sessionKey": session_key}, _LAPS_PROJECTION,
        ) or {}
        laps = doc.get("processedLaps", []) or []
        roster = doc.get("drivers", []) or []

        keep_dns: set = set(extra_dns)
        if dn is not None:
            keep_dns.add(dn)
        else:
            tid = tid_hint
            if tid:
                keep_dns |= {
                    d.get("driverNumber") for d in roster
                    if d.get("teamId") == tid
                }
        if keep_dns:
            laps = [l for l in laps if l.get("driverNumber") in keep_dns]

        laps = [l for l in laps if lo <= int(l.get("lap", 0) or 0) <= hi]

        return _dumps({
            "sessionKey":  session_key,
            "scope":       scope,
            "lapWindow":   [lo, hi],
            "sliceDriverNumbers": sorted(n for n in keep_dns if isinstance(n, int)),
            "drivers":     roster,
            "sessionResults": doc.get("sessionResults", []),
            "processedLaps":  laps,
        })

    # ── scope_context_pack ────────────────────────────────────────────────

    @tool("scope_context_pack")
    def scope_context_pack() -> str:
        """One-shot digest for this story: focal driver + teammate + any
        drivers the angle explicitly cites — all within the angle window,
        plus stints, lap-telemetry aggregates and scope-filtered signals.
        The session leader is included ONLY when the angle text invites it;
        otherwise the leader's fastest lap is exposed via `baseline` as a
        reference-only stat. Prefer this over multiple read_* calls — it is
        faster, cheaper, and guarantees the analyst sees the same slice the
        verifier will check."""
        return _dumps(materialize_context_slice(
            session_key, scope, lap_window,
            extra_driver_numbers=sorted(extra_dns) if extra_dns else None,
            include_leader=include_leader,
        ))

    # ── read_lap_telemetry_trace ──────────────────────────────────────────

    @tool("read_lap_telemetry_trace")
    def read_lap_telemetry_trace(lap: int, channels: list[str]) -> str:
        """Per-frame raw telemetry for ONE lap of the focal driver. Allowed
        channels: speed, throttle, brake, drs, nGear, rpm, distance,
        distanceToAhead, z. The lap MUST be inside this story's angle window;
        out-of-window requests are rejected. Use sparingly — only for
        sentence-level claims (corner-exit speed, brake point, gear shift)
        that need raw-trace evidence."""
        try:
            lap_i = int(lap)
        except (TypeError, ValueError):
            return _dumps({"error": f"invalid lap: {lap!r}"})
        if not (lo <= lap_i <= hi):
            return _dumps({"error": f"lap {lap_i} outside angle window [{lo},{hi}]"})
        if dn is None:
            return _dumps({"error": "read_lap_telemetry_trace requires a driver-scoped story"})

        wanted = [c for c in (channels or []) if c in _ALLOWED_TRACE_CHANNELS]
        if not wanted:
            return _dumps({
                "error": "no allowed channels requested",
                "allowed": sorted(_ALLOWED_TRACE_CHANNELS),
            })

        proj = {c: 1 for c in wanted}
        proj.update({"sessionTime": 1, "_id": 0})
        doc = db_client.raw_lap_telemetry().find_one(
            {"sessionKey": session_key, "driverNumber": dn, "lap": lap_i},
            proj,
        )
        if not doc:
            return _dumps({"error": f"no raw_lap_telemetry for driver {dn} lap {lap_i}"})

        # Downsample defensively — even a single lap can be 1000+ frames.
        # Take every Nth frame to cap at ~200 samples for the LLM.
        def _downsample(arr, max_n=200):
            if not isinstance(arr, list) or len(arr) <= max_n:
                return arr
            step = max(1, len(arr) // max_n)
            return arr[::step]

        out = {"lap": lap_i, "driverNumber": dn}
        for k, v in doc.items():
            out[k] = _downsample(v) if isinstance(v, list) else v
        return _dumps(out)

    # ── focal_tire_degradation ────────────────────────────────────────────

    @tool("focal_tire_degradation")
    def focal_tire_degradation(driver_number: int | None = None) -> str:
        """Tire-degradation rate (s/lap) for THIS story's focus driver, or for
        another driver in the focus set if `driver_number` is passed. Returns
        an error for any driver outside the focus — the story is about the
        listed entities only."""
        target = int(driver_number) if driver_number is not None else dn
        if target is None:
            # Team scope, no default — pick first team driver if any.
            target = next(iter(sorted(focus_dns)), None)
        if target is None or not _in_focus(target):
            return _focus_err()
        return _dumps(compute_tire_degradation_impl(session_key, int(target)))

    # ── focal_lap_percentile ──────────────────────────────────────────────

    @tool("focal_lap_percentile")
    def focal_lap_percentile(lap_number: int, driver_number: int | None = None) -> str:
        """Where the focus driver's lap ranks (percentile) among the full
        field on that lap. Useful for one-shot 'top X%' anchors. Lap MUST be
        inside this story's angle window."""
        try:
            lap_i = int(lap_number)
        except (TypeError, ValueError):
            return _dumps({"error": f"invalid lap: {lap_number!r}"})
        if not (lo <= lap_i <= hi):
            return _dumps({"error": f"lap {lap_i} outside angle window [{lo},{hi}]"})

        target = int(driver_number) if driver_number is not None else dn
        if target is None:
            target = next(iter(sorted(focus_dns)), None)
        if target is None or not _in_focus(target):
            return _focus_err()
        return _dumps(compute_lap_percentile_impl(session_key, int(target), lap_i))

    # ── focal_gap ─────────────────────────────────────────────────────────

    @tool("focal_gap")
    def focal_gap(other_driver_number: int, lap_number: int) -> str:
        """Cumulative gap (s) between the focus driver and `other_driver_number`
        through `lap_number`. `other_driver_number` MUST be in the focus set
        (focal + team-mate + any drivers cited in the angle title) and the lap
        MUST be inside the angle window."""
        try:
            other = int(other_driver_number)
            lap_i = int(lap_number)
        except (TypeError, ValueError):
            return _dumps({"error": "invalid arguments"})
        if not (lo <= lap_i <= hi):
            return _dumps({"error": f"lap {lap_i} outside angle window [{lo},{hi}]"})

        anchor = dn if dn is not None else next(iter(sorted(focus_dns - {other})), None)
        if anchor is None:
            return _dumps({"error": "no focal driver to anchor the gap"})
        if not _in_focus(other):
            return _focus_err()
        return _dumps(compute_gap_between_drivers_impl(session_key, int(anchor), other, lap_i))

    # ── focal_lap_summary ─────────────────────────────────────────────────

    @tool("focal_lap_summary")
    def focal_lap_summary() -> str:
        """Mean/std/fastest/slowest lap times for ONLY the focus drivers
        (focal + team-mate + angle-cited entities). Replaces the session-wide
        summary so the analyst never sees the rest of the grid."""
        if not focus_dns:
            return _dumps({"error": "empty focus set"})
        return _dumps(session_lap_summary_impl(session_key, list(sorted(focus_dns))))

    # ── focus_graph_specs ─────────────────────────────────────────────────

    @tool("focus_graph_specs")
    def focus_graph_specs() -> str:
        """Graph specs scoped to THIS story's focus: the focal driver/team and
        any drivers explicitly cited in the angle. No session-wide grid graphs
        — they don't belong in an angle-driven story."""
        or_clauses: list[dict] = []
        if focus_dns:
            or_clauses.append({"driverNumber": {"$in": sorted(focus_dns)}})
        if tid_hint:
            or_clauses.append({"teamId": tid_hint})
        if not or_clauses:
            return _dumps([])

        specs = list(db_client.graph_specs().find(
            {"sessionKey": session_key, "$or": or_clauses}
        ))
        for s in specs:
            s["id"] = str(s.pop("_id"))
            s.pop("dataPoints", None)
        return _dumps(specs)

    # ── generate_custom_telemetry_graph ───────────────────────────────────

    @tool("generate_custom_telemetry_graph")
    def generate_custom_telemetry_graph(lap_number: int, driver_numbers: list[int], channel: str) -> str:
        """Dynamically generate a custom telemetry trace graph (e.g. speed, throttle) for specific drivers on a specific lap.
        Use this ONLY when the story angle explicitly demands a trace chart that is NOT available in focus_graph_specs().
        Returns a JSON object with the new 'id' (graphId), which MUST be used in the final graph array payload.
        Allowed channels: speed, throttle, brake, drs, nGear, rpm.
        The requested lap MUST be within the angle window.
        """
        try:
            lap_i = int(lap_number)
        except (TypeError, ValueError):
            return _dumps({"error": f"invalid lap: {lap_number!r}"})
        if not (lo <= lap_i <= hi):
            return _dumps({"error": f"lap {lap_i} outside angle window [{lo},{hi}]"})
        
        valid_channels = {
            "speed": ("Speed (km/h)", "km/h"),
            "throttle": ("Throttle (%)", "%"),
            "brake": ("Brake", ""),
            "drs": ("DRS", ""),
            "nGear": ("Gear", ""),
            "rpm": ("RPM", "rpm")
        }
        if channel not in valid_channels:
            return _dumps({"error": f"invalid channel {channel}. Allowed: {list(valid_channels.keys())}"})
            
        targets = [int(d) for d in (driver_numbers or []) if _in_focus(int(d))]
        if not targets:
            return _focus_err()
            
        docs = {}
        max_dist_len = 0
        best_dist = None
        for d in targets:
            doc = db_client.raw_lap_telemetry().find_one(
                {"sessionKey": session_key, "driverNumber": d, "lap": lap_i},
                {"distance": 1, channel: 1, "_id": 0}
            )
            if doc and doc.get("distance") and doc.get(channel):
                docs[d] = doc
                if len(doc["distance"]) > max_dist_len:
                    max_dist_len = len(doc["distance"])
                    best_dist = doc["distance"]
                    
        if not docs or not best_dist:
            return _dumps({"error": "no raw telemetry found for the requested lap and drivers"})
            
        # Downsample base distance
        def _downsample(arr, max_n=200):
            if not isinstance(arr, list) or len(arr) <= max_n:
                return arr
            step = max(1, len(arr) // max_n)
            return arr[::step]
            
        dist = _downsample(best_dist)
        
        def _resample(doc_d, doc_v):
            if not doc_d or not doc_v:
                return [None] * len(dist)
            out = []
            j = 0
            for x in dist:
                while j + 1 < len(doc_d) and doc_d[j + 1] < x:
                    j += 1
                try:
                    val = float(doc_v[min(j, len(doc_v) - 1)])
                    out.append(round(val, 1))
                except Exception:
                    out.append(None)
            return out

        data_points = []
        series_data = {}
        for d in targets:
            if d in docs:
                series_data[d] = _resample(docs[d]["distance"], docs[d][channel])
                
        for i, x in enumerate(dist):
            row = {"distance": round(float(x), 1)}
            for d in targets:
                if d in series_data:
                    row[str(d)] = series_data[d][i]
            data_points.append(row)
            
        series = []
        colors = ["#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#33FFF6"]
        for idx, d in enumerate(targets):
            if d not in docs: continue
            roster_doc = next((r for r in _roster if r.get("driverNumber") == d), {})
            abbr = roster_doc.get("abbreviation", f"#{d}")
            c = str(roster_doc.get("teamColor", colors[idx % len(colors)])).lstrip("#")
            series.append({
                "id": str(d),
                "label": f"{abbr} (L{lap_i})",
                "driverNumber": d,
                "color": f"#{c}",
                "dataKey": str(d),
                "type": "actual" if d == dn else "reference"
            })
            
        label, unit = valid_channels[channel]
        spec = {
            "type": "multi_line",
            "title": f"Custom {channel.title()} Trace - Lap {lap_i}",
            "sessionKey": session_key,
            "scopeKind": "story_custom",
            "xAxis": {"key": "distance", "label": "Distance (m)", "unit": "m"},
            "yAxis": {"key": channel, "label": label, "unit": unit},
            "series": series,
            "dataPoints": data_points
        }
        
        res = db_client.graph_specs().insert_one(spec)
        spec["id"] = str(res.inserted_id)
        spec.pop("_id", None)
        spec.pop("dataPoints", None)
        return _dumps(spec)

    return [
        read_scoped_laps, scope_context_pack, read_lap_telemetry_trace,
        focal_tire_degradation, focal_lap_percentile, focal_gap,
        focal_lap_summary, focus_graph_specs, generate_custom_telemetry_graph,
    ]
