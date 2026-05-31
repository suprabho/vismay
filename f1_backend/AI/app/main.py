"""
Apex AI Worker — FastAPI entry point.

Endpoints:
  POST /run/telemetry-analysis  → LangGraph pipeline (background)
  POST /run/story-generation    → CrewAI pipeline (background)
  GET  /run/{run_id}/status     → poll job status
  GET  /health                  → liveness check
"""

from __future__ import annotations

import datetime
import logging
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from time import time

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Header
from starlette.middleware.cors import CORSMiddleware

from app.config import settings
from .models.analysis_request import AnalysisRequest
from .models.story_request import StoryRequest
from .utils import db_client
from .utils.resilient import backend_post as _resilient_post
from .routes.ingest import router as ingest_router

logger = logging.getLogger("apex.ai")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Apex AI Worker", version="1.0.0")
app.include_router(ingest_router)

# Bounded pool for background pipeline runs. Caps how many heavy LangGraph/CrewAI
# jobs execute concurrently instead of flooding the default executor.
_RUN_POOL = ThreadPoolExecutor(
    max_workers=max(1, settings.MAX_CONCURRENT_RUNS),
    thread_name_prefix="apex-run",
)


def _mark_run_failed(run_id: str | None, err: str) -> None:
    if not run_id:
        return
    try:
        db_client.story_runs().update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {"status": "failed", "error": err},
             "$push": {"logs": f"runner crashed: {err}"}},
        )
    except Exception:
        logger.exception("Could not mark run %s failed", run_id)


def _dispatch(fn, req) -> None:
    """Submit a runner to the bounded pool, guaranteeing the run never gets stuck
    in 'running': any unhandled exception finalises the StoryRun as failed."""
    def _guarded() -> None:
        try:
            fn(req)
        except Exception as e:  # noqa: BLE001 — last-resort guard
            logger.exception("Background runner %s failed", getattr(fn, "__name__", fn))
            _mark_run_failed(getattr(req, "story_run_id", None), str(e))
    _RUN_POOL.submit(_guarded)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth guard ────────────────────────────────────────────────────────────────

def _verify_secret(x_worker_secret: str | None) -> None:
    if settings.AI_WORKER_SECRET and x_worker_secret != settings.AI_WORKER_SECRET:
        raise HTTPException(status_code=403, detail="Invalid worker secret")


# ── Background runners ────────────────────────────────────────────────────────

def _run_telemetry(req: AnalysisRequest) -> None:
    from .pipelines.telemetry_graph import telemetry_graph, TelemetryState

    logger.info("Starting telemetry pipeline for session %s", req.session_key)
    initial_state: TelemetryState = {
        "session_key": req.session_key,
        "story_id": req.story_id,
        "story_run_id": req.story_run_id,
        "context": req.context,
        "session_data": {},
        "laps_df": None,
        "events": [],
        "signals": [],
        "projections": {},
        "graph_specs": [],
        "team_graph_specs": [],
        "errors": [],
    }

    try:
        final_state = telemetry_graph.invoke(initial_state)

        # The graph aborts (and marks the run failed) on missing/empty sessions.
        # Don't chain angle discovery or overwrite the failure with 'done'.
        if final_state.get("fatal_error"):
            logger.warning("Telemetry pipeline aborted for %s: %s",
                           req.session_key, final_state["fatal_error"])
            return

        logger.info("Telemetry pipeline complete for session %s", req.session_key)

        # 'full' pipeline auto-chains into ANGLE DISCOVERY (not story generation).
        # The admin reviews/selects angles, then triggers story generation separately
        # (stage='stories' → /run/story-generation). 'langraph_telemetry' stops here.
        if req.pipeline == "full":
            _run_angle_discovery(req)
        else:
            db_client.story_runs().update_one(
                {"_id": ObjectId(req.story_run_id)},
                {"$set": {"status": "done", "completedAt": datetime.datetime.now(datetime.timezone.utc)}},
            )

    except Exception as e:
        logger.error("Telemetry pipeline failed: %s", e)
        db_client.story_runs().update_one(
            {"_id": ObjectId(req.story_run_id)},
            {"$set": {"status": "failed", "error": str(e)}},
        )


def _backend_post(path: str, data: dict) -> dict:
    """Resilient POST (retry/backoff + numpy-safe) to the Backend API."""
    return _resilient_post(path, data)


def _append_log(run_id: str, line: str) -> None:
    try:
        db_client.story_runs().update_one(
            {"_id": ObjectId(run_id)},
            {"$push": {"logs": line}},
        )
    except Exception:
        pass


def _collect_drivers_teams(session: dict) -> tuple[list[dict], dict[str, str]]:
    """Return the driver roster and a {teamId: teamName} map from a session doc."""
    drivers = session.get("drivers") or []
    teams: dict[str, str] = {}
    for d in drivers:
        tid = d.get("teamId")
        if tid:
            teams[tid] = d.get("teamName") or tid
    return drivers, teams


def _run_angle_discovery(req: AnalysisRequest) -> None:
    """Stage A: discover interesting analysis angles per driver/team and persist
    them (status='proposed') for admin review. Generates NO stories.

    Reachable via:
      • POST /run/angle-discovery        (crew_story pipeline — uses pre-existing signals)
      • auto-chain from _run_telemetry   (full pipeline — telemetry just produced fresh signals)
    """
    from .pipelines.story_crew import discover_angles_for_scope

    run_id = req.story_run_id
    # "session" is accepted in scopes for API consistency but deliberately skipped
    # here — running a session crew at angle-discovery time would be redundant and
    # expensive. Session-level angles are surfaced by the session crew in Stage C.
    scopes = set(req.scopes or ["session", "driver", "team"])
    _append_log(run_id, f"angle_discovery: scopes={sorted(scopes - {'session'})} max_per_scope={settings.ANGLES_PER_SCOPE}")

    session = db_client.telemetry_sessions().find_one({"sessionKey": req.session_key})
    if not session:
        logger.error("Session %s not found for angle discovery", req.session_key)
        db_client.story_runs().update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {"status": "failed", "error": f"session {req.session_key} not found"}},
        )
        return

    drivers, teams = _collect_drivers_teams(session)
    lock = Lock()
    counts = {"angles": 0}

    def _persist(docs: list[dict], label: str) -> None:
        if not docs:
            return
        # Global cap across all scopes so a full grid can't flood review with
        # dozens of angles (e.g. 20 drivers × 4 = 80).
        with lock:
            remaining = settings.MAX_TOTAL_ANGLES - counts["angles"]
            if remaining <= 0:
                _append_log(run_id, f"angle_discovery: {label} skipped — global cap {settings.MAX_TOTAL_ANGLES} reached")
                return
            docs = docs[:remaining]
            counts["angles"] += len(docs)
        try:
            _backend_post("/api/analysis-angles", {"angles": docs})
            _append_log(run_id, f"angle_discovery: {label} → {len(docs)} angles")
        except Exception as e:
            with lock:
                counts["angles"] -= len(docs)  # roll back the reservation on failure
            logger.warning("Failed to persist angles for %s: %s", label, e)
            _append_log(run_id, f"angle_discovery: {label} persist FAILED — {e}")

    def _drv_scout(d: dict) -> None:
        dn = int(d["driverNumber"])
        scope = {
            "kind": "driver", "driverNumber": dn, "driverName": d.get("fullName"),
            "teamId": d.get("teamId"), "teamName": d.get("teamName"),
        }
        angles = discover_angles_for_scope(req.session_key, scope, max_angles=settings.ANGLES_PER_SCOPE)
        docs = [{
            **a,
            "sessionKey": req.session_key, "runId": run_id, "scopeKind": "driver",
            "driverNumber": dn, "teamId": d.get("teamId"), "teamName": d.get("teamName"),
        } for a in angles]
        _persist(docs, f"driver #{dn}")

    def _team_scout(tid: str, tname: str) -> None:
        scope = {"kind": "team", "teamId": tid, "teamName": tname}
        angles = discover_angles_for_scope(req.session_key, scope, max_angles=settings.ANGLES_PER_SCOPE)
        docs = [{
            **a,
            "sessionKey": req.session_key, "runId": run_id, "scopeKind": "team",
            "driverNumber": None, "teamId": tid, "teamName": tname,
        } for a in angles]
        _persist(docs, f"team {tname}")

    started = time()
    with ThreadPoolExecutor(max_workers=max(1, settings.STORY_CONCURRENCY)) as pool:
        if "driver" in scopes:
            for d in drivers:
                if d.get("driverNumber") is not None:
                    pool.submit(_drv_scout, d)
        if "team" in scopes:
            for tid, tname in teams.items():
                pool.submit(_team_scout, tid, tname)

    elapsed = time() - started
    db_client.story_runs().update_one(
        {"_id": ObjectId(run_id)},
        {"$set": {"status": "done", "completedAt": datetime.datetime.now(datetime.timezone.utc)}},
    )
    _append_log(run_id, f"angle_discovery: {counts['angles']} angles proposed in {elapsed:.1f}s — awaiting review")


def _ensure_angle_draft(
    session_key: str,
    parent_story_id: str,
    angle: dict,
    scope: dict,
    category: str,
    title: str,
    run_id: str,
) -> str | None:
    """Create (or reuse) the draft Story for one selected angle. Idempotent: the
    angle doc is linked to its story via `storyId`, so re-runs reuse it."""
    if angle.get("storyId"):
        return str(angle["storyId"])

    angle_id = str(angle["_id"])
    payload = {
        "slug":       f"{session_key}-{scope['kind']}-{angle_id}-{int(time())}",
        "status":     "draft",
        "category":   category,
        "title":      title[:200],
        "summary":    "",
        "coverImage": {"url": "", "alt": ""},
        "content":    [],
        "tags":       [angle.get("priority")] if angle.get("priority") else [],
        "sessionKey": session_key,
        "scope": {
            "kind":         scope.get("kind"),
            "driverNumber": scope.get("driverNumber"),
            "teamId":       scope.get("teamId"),
            "teamName":     scope.get("teamName"),
        },
        "parentStoryId":   parent_story_id,
        "analysisAngleId": angle_id,
        "aiGenerated":     True,
    }
    try:
        created = _backend_post("/api/stories", payload)
        sid = created.get("_id") or created.get("id")
        if sid:
            db_client.analysis_angles().update_one(
                {"_id": angle["_id"]}, {"$set": {"storyId": ObjectId(sid)}}
            )
        return sid
    except Exception as e:
        logger.warning("Failed to create draft for angle %s: %s", angle_id, e)
        _append_log(run_id, f"story_fanout: draft for angle {angle_id} FAILED — {e}")
        return None


def _run_story_fanout(req: "AnalysisRequest | StoryRequest") -> None:
    """Stage C: generate the session master story plus ONE story per SELECTED angle.

    Driver/team angles come from the `analysis_angles` collection (status='selected'),
    produced by Stage A and curated by the admin. This is the path that fixes the
    old 'only one story' bug — the number of stories now scales with selected angles.
    """
    from .pipelines.story_crew import run_story_crew

    run_id = req.story_run_id
    scopes = set(req.scopes or ["session", "driver", "team"])
    _append_log(run_id, f"story_fanout: scopes={sorted(scopes)}")

    session = db_client.telemetry_sessions().find_one({"sessionKey": req.session_key})
    if not session:
        logger.error("Session %s not found for fanout", req.session_key)
        db_client.story_runs().update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {"status": "failed", "error": f"session {req.session_key} not found"}},
        )
        return

    drivers, _teams = _collect_drivers_teams(session)
    driver_by_num = {int(d["driverNumber"]): d for d in drivers if d.get("driverNumber") is not None}

    # Check if there are selected angles — if so, the session master story
    # was already produced during the initial pipeline run, so skip the
    # expensive session crew and jump straight to angle-driven generation.
    has_selected_angles = False
    if getattr(req, "angle_id", None):
        has_selected_angles = True
    else:
        has_selected_angles = db_client.analysis_angles().count_documents(
            {"sessionKey": req.session_key, "status": "selected"}
        ) > 0

    shared_brief: str | None = None
    session_crew_failed = False

    if has_selected_angles and "session" in scopes:
        # Skip the full session crew — jump straight to the angle-driven crews.
        # The session master story already exists from the initial run.
        _append_log(run_id, "story_fanout: selected angles found — skipping session crew (already produced)")
    elif "session" in scopes:
        # No selected angles — run the session crew as normal.
        # IMPORTANT: run_story_crew catches its own exceptions and returns None on failure
        # (it also sets status="failed" internally for session scope). We must check for
        # None here and abort — otherwise the fanout finalizer below would overwrite the
        # "failed" status with "done".
        shared_brief = run_story_crew(
            session_key=req.session_key,
            story_id=req.story_id,
            story_run_id=run_id,
            context=req.context,
            scope={"kind": "session"},
            capture_brief=True,
            final_status=None,
        )
        if shared_brief is None:
            _append_log(run_id, "story_fanout: session crew returned None — aborting fanout")
            session_crew_failed = True

    if session_crew_failed:
        return

    # 2. Pull the admin-selected angles for the requested scopes
    selected: list[dict] = []
    
    if getattr(req, "angle_id", None):
        # We are generating a specific angle directly from the Angles Browser.
        # Ignore "status" (it might be proposed/rejected) and fetch just this angle.
        try:
            from bson import ObjectId
            single_angle = db_client.analysis_angles().find_one({"_id": ObjectId(req.angle_id)})
            if single_angle:
                selected.append(single_angle)
                has_selected_angles = True # force skip session crew
        except Exception as e:
            logger.error("Failed to load specific angle %s: %s", req.angle_id, e)
    else:
        # We are generating all selected angles (e.g. from the Workflow Panel)
        if "driver" in scopes:
            selected += list(db_client.analysis_angles().find(
                {"sessionKey": req.session_key, "scopeKind": "driver", "status": "selected"}
            ))
        if "team" in scopes:
            selected += list(db_client.analysis_angles().find(
                {"sessionKey": req.session_key, "scopeKind": "team", "status": "selected"}
            ))
    _append_log(run_id, f"story_fanout: {len(selected)} selected angles")

    lock = Lock()
    driver_story_ids: dict[str, dict] = {}
    team_story_ids: dict[str, dict] = {}
    all_story_ids: list[str] = [req.story_id]

    # 3. One crew per selected angle, bounded concurrency
    def _angle_job(angle: dict) -> None:
        angle_id = str(angle["_id"])
        kind = angle.get("scopeKind")
        if kind == "driver":
            dn = int(angle["driverNumber"])
            d = driver_by_num.get(dn, {})
            scope = {
                "kind": "driver", "driverNumber": dn, "driverName": d.get("fullName"),
                "teamId": angle.get("teamId") or d.get("teamId"),
                "teamName": angle.get("teamName") or d.get("teamName"),
            }
            title = f"{d.get('fullName') or 'Driver'} #{dn} — {angle.get('title', '')}"
            category = "driver-analysis"
            bucket, key = driver_story_ids, str(dn)
        elif kind == "team":
            tid = angle.get("teamId")
            tname = angle.get("teamName") or tid
            scope = {"kind": "team", "teamId": tid, "teamName": tname}
            title = f"{tname} — {angle.get('title', '')}"
            category = "team-analysis"
            bucket, key = team_story_ids, str(tid)
        else:
            return

        sid = _ensure_angle_draft(req.session_key, req.story_id, angle, scope, category, title, run_id)
        if not sid:
            return

        # Hydrate signals
        signal_ids = angle.get("supportingSignalIds", [])
        hydrated_signals = []
        if signal_ids:
            try:
                oids = [ObjectId(sig_id) for sig_id in signal_ids if sig_id]
                if oids:
                    sig_docs = list(db_client.signals().find({"_id": {"$in": oids}}))
                    for sig_doc in sig_docs:
                        sig_doc["id"] = str(sig_doc.pop("_id", None))
                    hydrated_signals = sig_docs
            except Exception as e:
                logger.warning("Failed to hydrate signals for angle %s: %s", angle_id, e)

        angle_spec = {
            "angleId":   angle_id,
            "title":     angle.get("title", ""),
            "rationale": angle.get("rationale", ""),
            "focus":     angle.get("focus", ""),
            "priority":  angle.get("priority", "med"),
            "signals":   hydrated_signals,
        }
        # Forward the Angle Scout's authoritative lap window when present;
        # lap_window_from_angle prefers this over signal/text inference.
        if angle.get("lapWindow"):
            angle_spec["lapWindow"] = angle["lapWindow"]
        run_story_crew(
            session_key=req.session_key,
            story_id=sid,
            story_run_id=run_id,
            context=req.context,
            scope=scope,
            shared_brief=shared_brief,
            final_status=None,
            angle_spec=angle_spec,
        )
        db_client.analysis_angles().update_one(
            {"_id": angle["_id"]},
            {"$set": {"status": "generated", "storyId": ObjectId(sid)}},
        )
        with lock:
            bucket.setdefault(key, {})[angle_id] = sid
            all_story_ids.append(sid)

    started = time()
    with ThreadPoolExecutor(max_workers=max(1, settings.STORY_CONCURRENCY)) as pool:
        for angle in selected:
            pool.submit(_angle_job, angle)

    elapsed = time() - started
    _append_log(run_id, f"story_fanout: scoped crews complete in {elapsed:.1f}s")

    # Record breakdown + finalise StoryRun
    try:
        db_client.story_runs().update_one(
            {"_id": ObjectId(run_id)},
            {"$set": {
                "outputRef.storyIds": all_story_ids,
                "outputRef.scopeBreakdown.sessionStoryId": req.story_id,
                "outputRef.scopeBreakdown.driverStoryIds": driver_story_ids,
                "outputRef.scopeBreakdown.teamStoryIds": team_story_ids,
                "status": "done",
                "completedAt": datetime.datetime.now(datetime.timezone.utc),
            }},
        )
    except Exception as e:
        logger.warning("Failed to record scope breakdown: %s", e)
    _append_log(run_id, "story_fanout: done")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm_provider": settings.LLM_PROVIDER}


@app.post("/run/telemetry-analysis")
async def run_telemetry_analysis(
    req: AnalysisRequest,
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    """Trigger LangGraph telemetry analysis pipeline for a session (runs in background)."""
    _verify_secret(x_worker_secret)

    # Update run status to 'running' in MongoDB
    db_client.story_runs().update_one(
        {"_id": ObjectId(req.story_run_id)},
        {"$set": {"status": "running"}, "$push": {"logs": "telemetry-analysis: queued"}},
    )

    _dispatch(_run_telemetry, req)
    return {"runId": req.story_run_id, "status": "running"}


@app.post("/run/angle-discovery")
async def run_angle_discovery(
    req: AnalysisRequest,
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    """Stage A for the crew_story pipeline: discover angles from pre-existing
    signals/session data (runs in background). Generates no stories."""
    _verify_secret(x_worker_secret)

    db_client.story_runs().update_one(
        {"_id": ObjectId(req.story_run_id)},
        {"$set": {"status": "running"}, "$push": {"logs": "angle-discovery: queued"}},
    )

    _dispatch(_run_angle_discovery, req)
    return {"runId": req.story_run_id, "status": "running"}


@app.post("/run/story-generation")
async def run_story_generation(
    req: StoryRequest,
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    """Stage C: fan out one story per admin-selected angle (+ session master story)."""
    _verify_secret(x_worker_secret)

    db_client.story_runs().update_one(
        {"_id": ObjectId(req.story_run_id)},
        {"$set": {"status": "running"}, "$push": {"logs": "story-generation: queued"}},
    )

    _dispatch(_run_story_fanout, req)

    return {"runId": req.story_run_id, "status": "running"}


@app.get("/run/{run_id}/status")
def get_run_status(run_id: str) -> dict:
    """Poll StoryRun status."""
    try:
        doc = db_client.story_runs().find_one({"_id": ObjectId(run_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid run ID")

    if not doc:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "runId": run_id,
        "status": doc.get("status", "unknown"),
        "logs": doc.get("logs", []),
        "error": doc.get("error"),
        "completedAt": str(doc["completedAt"]) if doc.get("completedAt") else None,
    }
