"""
CrewAI story generation pipeline.

5 agents in sequential process:
  TelemetryAnalyst → SignalDetector → StoryWriter → ChartCurator → FactChecker

Output: Story content blocks + graph embedding instructions → patched to Backend API.
"""

from __future__ import annotations

import logging
import re
from bson import ObjectId

from crewai import Agent, Crew, Task, Process

from ..config import get_llm
from ..tools.mongo_tool import read_session, read_graph_specs, read_signals
from ..tools.scoped_tools import build_scoped_tools, materialize_context_slice
from ..tools.stats_tool import (
    compute_tire_degradation,
    compute_lap_percentile,
    compute_gap_between_drivers,
    session_lap_summary,
)
from ..utils import db_client
from ..utils.resilient import backend_patch as _resilient_patch
from ..utils.json_parse import extract_json_array as _extract_json_array
from ..utils.json_parse import extract_json_object as _extract_json_object
from ..utils.grounding import (
    lap_window_from_angle as _lap_window_from_angle,
    verify_claims_against_slice as _verify_claims_against_slice,
    resolve_angle_entities as _resolve_angle_entities,
    filter_brief_for_angle as _filter_brief_for_angle,
    angle_invites_teammate_comparison as _angle_invites_teammate,
    angle_invites_leader_comparison as _angle_invites_leader,
    angle_is_head_to_head as _angle_is_head_to_head,
)
from ..utils.judge import judge_angle_coherence as _judge_angle_coherence

logger = logging.getLogger(__name__)


def _backend_patch(path: str, data: dict) -> dict:
    """Resilient PATCH (retry/backoff + numpy-safe) to the Backend API."""
    return _resilient_patch(path, data)


def _update_run_log(run_id: str, log: str) -> None:
    try:
        db_client.story_runs().update_one(
            {"_id": ObjectId(run_id)},
            {"$push": {"logs": log}},
        )
    except Exception:
        pass


def _valid_graph_ids(session_key: str, scope: dict | None) -> set[str]:
    """IDs of graph specs that genuinely exist for this scope (mirrors
    read_graph_specs scoping). Used to reject hallucinated graphId embeds."""
    scope = scope or {}
    query: dict = {"sessionKey": session_key}
    dn = scope.get("driverNumber")
    tid = scope.get("teamId")
    if dn is not None:
        query["$or"] = [{"driverNumber": int(dn)}, {"scopeKind": "session"},
                        {"driverNumber": {"$exists": False}, "teamId": {"$exists": False}}]
    elif tid:
        query["$or"] = [{"teamId": tid}, {"scopeKind": "session"},
                        {"driverNumber": {"$exists": False}, "teamId": {"$exists": False}}]
    try:
        return {str(s["_id"]) for s in db_client.graph_specs().find(query, {"_id": 1})}
    except Exception as e:
        logger.warning("_valid_graph_ids failed for %s: %s", session_key, e)
        return set()


_LAP_CITE_RE = re.compile(r"\blap\s+(\d{1,3})\b", re.IGNORECASE)


def _session_max_lap(session_key: str) -> int:
    try:
        doc = db_client.telemetry_sessions().find_one(
            {"sessionKey": session_key}, {"processedLaps.lap": 1}
        )
    except Exception:
        return 0
    laps = (doc or {}).get("processedLaps") or []
    return max((int(l.get("lap", 0) or 0) for l in laps), default=0)


def _check_lap_citations(session_key: str, blocks: list[dict]) -> int:
    """Count cited 'lap N' references that exceed the session's lap count — a cheap
    grounding signal that the (unverified) driver/team narrative may be fabricated."""
    max_lap = _session_max_lap(session_key)
    if max_lap <= 0:
        return 0
    bad = 0
    for b in blocks:
        if not isinstance(b, dict):
            continue
        text = b.get("text")
        if not isinstance(text, str):
            continue
        for m in _LAP_CITE_RE.finditer(text):
            if int(m.group(1)) > max_lap:
                bad += 1
    return bad


_FENCE_RE   = re.compile(r'```[\s\S]*?```')
_INLINE_RE  = re.compile(r'`([^`\n]+)`')
_GRAPHID_RE = re.compile(r'"?graphId"?\s*[:=]', re.IGNORECASE)
# Matches a JSON object opening that contains graphId — catches blocks where the
# writer leaked actual chart embedding JSON into a narrative paragraph.
# We require '{' (object start) so that a sentence like "the graphId field..." is
# NOT dropped — only blocks that contain real JSON structure with graphId are dropped.
_GRAPHID_JSON_RE = re.compile(r'\{[^}]*"?graphId"?\s*[:=]', re.IGNORECASE | re.DOTALL)


def _strip_fences(text: str) -> str:
    cleaned = _FENCE_RE.sub('', text)
    cleaned = _INLINE_RE.sub(r'\1', cleaned)
    return cleaned.strip()


def _sanitize_content_blocks(blocks: list[dict]) -> list[dict]:
    """Remove LLM-leaked code fences / chart JSON from narrative blocks.

    Driver and team crews skip the fact-checker stage, so this is the only
    guardrail against the Story Writer dumping the Chart Curator's expected
    output format into a paragraph.

    Drop rules (all must be satisfied to drop a block):
      • text contains a code fence (```) — OR —
      • text contains actual JSON structure with a graphId key (`{...graphId...}`)

    The old rule also checked for bare `[` which was too broad: any paragraph
    with a citation like "[VER led for 12 laps]" next to a natural "graphId"
    mention would be silently dropped.
    """
    cleaned: list[dict] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue

        btype = block.get("type")
        if btype not in ("paragraph", "heading", "quote", "stat", "graph_embed", "telemetry_clip"):
            btype = "paragraph"
            block = {**block, "type": btype}

        if btype in ("graph_embed", "telemetry_clip"):
            cleaned.append(block)
            continue
        
        text = block.get("text")
        if isinstance(text, str):
            # Drop blocks that leaked raw chart JSON or code fences
            if '```' in text or _GRAPHID_JSON_RE.search(text):
                continue
            stripped = _strip_fences(text)
            if not stripped:
                continue
            block = {**block, "text": stripped}
        cleaned.append(block)
    return cleaned


def _scope_label(scope: dict) -> str:
    kind = (scope or {}).get("kind", "session")
    if kind == "driver":
        dn = scope.get("driverNumber")
        name = scope.get("driverName") or f"#{dn}"
        return f"driver {name} (#{dn})"
    if kind == "team":
        return f"team {scope.get('teamName') or scope.get('teamId') or ''}"
    return "session"


def _scope_category(scope: dict) -> str:
    kind = (scope or {}).get("kind", "session")
    if kind == "driver":
        return "driver-analysis"
    if kind == "team":
        return "team-analysis"
    return "race-analysis"


def _scope_title_prefix(scope: dict, session_key: str) -> str:
    kind = (scope or {}).get("kind", "session")
    if kind == "driver":
        return f"{scope.get('driverName') or '#' + str(scope.get('driverNumber'))} — {session_key}"
    if kind == "team":
        return f"{scope.get('teamName') or scope.get('teamId')} — {session_key}"
    return f"Analysis — {session_key}"


def build_story_crew(
    session_key: str,
    story_id: str,
    story_run_id: str,
    context: str = "",
    scope: dict | None = None,
    shared_brief: str | None = None,
    angle_spec: dict | None = None,
    angle_entities: dict | None = None,
) -> Crew:
    scope = scope or {"kind": "session"}
    kind = scope.get("kind", "session")
    llm = get_llm()

    # Derive the lap window for this story from the angle's supporting signals.
    # For driver/team crews this is the *only* slice of laps the analyst can
    # see — enforced at the tool layer, not the prompt layer. Session-scope
    # crews use the full session (default=None).
    lap_window = _lap_window_from_angle(angle_spec, default=None)

    # Drivers/teams the angle explicitly cites (resolved upstream). The scoped
    # tools include their data even when they're not the focal driver's
    # teammate — so an angle "Verstappen vs. Hamilton" actually gets Hamilton
    # data, not whoever happens to share Verstappen's garage.
    entities = angle_entities or {}
    extra_dns: list[int] = [n for n in (entities.get("driverNumbers") or []) if isinstance(n, int)]
    focus_descriptors: list[str] = list(entities.get("descriptors") or [])

    # Decide once whether this angle invites teammate / leader comparisons.
    # Drives BOTH (a) whether the leader's data is materialised into the slice
    # and (b) which writer prompt clauses are emitted. The old code uncondi-
    # tionally included the leader and demanded MANDATORY comparisons; that
    # was the second-biggest driver of off-angle stories.
    wants_teammate = _angle_invites_teammate(angle_spec)
    wants_leader   = _angle_invites_leader(angle_spec)
    is_h2h         = _angle_is_head_to_head(angle_spec)

    # Scoped tools: closure-bound to (session_key, scope, lap_window, extra_dns).
    # Driver/team agents use these instead of the global read_session so they
    # cannot accidentally widen the fetch. The returned list contains BOTH the
    # data-reading tools (read_scoped_laps, scope_context_pack,
    # read_lap_telemetry_trace) and the focal compute tools
    # (focal_tire_degradation, focal_lap_percentile, focal_gap,
    # focal_lap_summary, focus_graph_specs) — every one of them rejects driver
    # numbers outside the angle's focus set.
    scoped_tools = build_scoped_tools(
        session_key, scope, lap_window,
        extra_driver_numbers=extra_dns or None,
        include_leader=wants_leader,
    )
    # The analyst scoped tools now just omit the graph tools since LangGraph handles them.
    analyst_scoped_tools = [
        t for t in scoped_tools if getattr(t, "name", "") not in ("focus_graph_specs", "generate_custom_telemetry_graph")
    ]

    # ── Agents ──────────────────────────────────────────────────────────────

    # For driver/team crews the analyst sees ONLY closure-bound scoped tools.
    # Session-wide compute_* helpers are deliberately omitted so the LLM cannot
    # reach outside the angle's focus set and fish for unrelated drivers. The
    # session crew still gets the broad tools because the session "angle" IS
    # the whole grid.
    if kind == "session":
        analyst_tools = [
            read_session,
            compute_tire_degradation, compute_lap_percentile,
            compute_gap_between_drivers, session_lap_summary,
        ]
    else:
        analyst_tools = list(analyst_scoped_tools)

    # Angle-aware goals: for driver/team crews the agent goal explicitly
    # references the angle so CrewAI's internal reasoning loop stays on-topic
    # instead of chasing "the most interesting" data across the whole grid.
    angle_title = (angle_spec or {}).get("title", "").strip()
    angle_focus_text = (angle_spec or {}).get("focus", "").strip()

    if kind != "session" and angle_title:
        analyst_goal = (
            f"Analyse ONLY the specific angle '{angle_title}' for session {session_key}. "
            f"Stay strictly on this angle — do NOT explore unrelated storylines or drivers."
        )
        analyst_backstory = (
            "You are a former Formula 1 data engineer with 15 years of experience at a top team. "
            "You have been assigned ONE specific editorial angle and must produce a technical brief "
            "that serves ONLY that angle. You ignore everything outside the angle's scope — "
            "other drivers, other incidents, other strategies. You communicate in precise, technical terms."
        )
        writer_goal = (
            f"Write a compelling editorial story about EXACTLY this angle: '{angle_title}' "
            f"for session {session_key}. Do NOT deviate from this angle or introduce unrelated subjects."
        )
        writer_backstory = (
            "You write for a premium motorsport publication. You have been given a SINGLE editorial angle "
            "and your job is to write a tight, focused narrative about that specific angle — nothing else. "
            "Every paragraph must advance the angle. You never pad with unrelated grid-wide commentary. "
            "You produce content at the level of The Race or Autosport long-form."
        )
    else:
        analyst_goal = "Extract the most technically significant moments from race telemetry data for session " + session_key
        analyst_backstory = (
            "You are a former Formula 1 data engineer with 15 years of experience at a top team. "
            "You read raw lap data and identify micro-stories in the numbers — tire degradation rates, "
            "braking points, ERS deployment patterns. You communicate only in precise, technical terms."
        )
        writer_goal = "Transform technical analysis into a compelling editorial story about session " + session_key
        writer_backstory = (
            "You write for a premium motorsport publication. Your stories are read by engineers and fans alike. "
            "You never use clichés. You start in the middle of the action, then zoom out. "
            "Every paragraph earns its place. You produce content at the level of The Race or Autosport long-form."
        )

    telemetry_analyst = Agent(
        role="F1 Telemetry Analyst",
        goal=analyst_goal,
        backstory=analyst_backstory,
        llm=llm,
        # Mongo-only: the ingest pipeline already normalised Fast-F1 into Mongo.
        # Reading from Mongo (vs re-loading Fast-F1 live per tool call) is faster,
        # cheaper, and keeps the crew consistent with the persisted data.
        tools=analyst_tools,
        verbose=True,
        max_iter=6,
    )

    signal_detector = Agent(
        role="Race Intelligence Analyst",
        goal="Identify and rank the strategically significant anomalies in session " + session_key,
        backstory=(
            "You watch races with the mind of a strategist. You flag the moments that changed the race outcome — "
            "tire compounds that underperformed, pit windows that were too late, safety cars that reshuffled the grid. "
            "You produce ranked signal summaries with tactical implications."
        ),
        llm=llm,
        tools=[read_session, read_signals,
               compute_tire_degradation, compute_lap_percentile,
               compute_gap_between_drivers, session_lap_summary],
        verbose=True,
        max_iter=3,
    )

    story_writer = Agent(
        role="Motorsport Journalist",
        goal=writer_goal,
        backstory=writer_backstory,
        llm=llm,
        verbose=True,
        max_iter=3,
    )


    fact_checker = Agent(
        role="F1 Data Fact Checker",
        goal="Verify that all claims in the story are supported by telemetry data for session " + session_key,
        backstory=(
            "You cross-reference every factual claim against the raw numbers. "
            "If a lap time is cited, you check it. If a delta is stated, you verify it. "
            "You flag unsupported claims and suggest corrections."
        ),
        llm=llm,
        tools=[read_session],
        verbose=True,
        max_iter=2,
    )

    # ── Tasks ────────────────────────────────────────────────────────────────

    context_note = f"\nExtra context provided by admin: {context}" if context else ""
    scope_label = _scope_label(scope)

    # Filter the session-wide brief: for angle-driven crews, only keep
    # sentences that mention the angle's focus entities. This prevents the LLM
    # from latching onto interesting but unrelated storylines from the broader
    # session brief that used to flood the prompt with 3,500 chars of noise.
    if kind != "session" and focus_descriptors and shared_brief:
        filtered_brief = _filter_brief_for_angle(shared_brief, focus_descriptors)
        brief_note = (
            f"\n\nRelevant context from the session analyst (filtered to this angle's subjects only):\n{filtered_brief}"
            if filtered_brief else ""
        )
    elif shared_brief:
        brief_note = f"\n\nUse this shared session brief as background context:\n{shared_brief[:3500]}"
    else:
        brief_note = ""

    dn = scope.get("driverNumber")
    tid = scope.get("teamId")

    # angle_title and angle_focus already extracted above for agent goals.
    import json
    angle_signals = (angle_spec or {}).get("signals", [])
    window_hint = (
        f"\n\nLAP WINDOW (enforced by tools): laps {lap_window[0]}–{lap_window[1]}. "
        f"You CANNOT read data outside this window — the scoped tools reject it."
        if lap_window else ""
    )
    signals_text = (
        f"\n\nSupporting signals for this angle:\n{json.dumps(angle_signals, indent=2)}"
        if angle_signals else ""
    )

    # Hard focus list — drivers/teams parsed out of the angle title/focus. The
    # writer MUST stay on these subjects; the analyst's tools have already been
    # bound to include their data. This is the single most important
    # anti-digression guardrail for angle-driven stories.
    leader_clause = (
        " The session leader is only included as a one-time pace baseline if the "
        "angle explicitly invites it (it does not, here)."
    ) if not wants_leader else (
        " The session leader IS a valid comparison subject because the angle "
        "explicitly invites it."
    )
    focus_lock = ""
    if focus_descriptors:
        focus_lock = (
            f"\n\nFOCUS LOCK — the ONLY subjects of this story: "
            f"{', '.join(focus_descriptors)}.\n"
            f"• Every paragraph must advance the angle about these specific drivers/teams.\n"
            f"• Do NOT introduce other drivers or teams beyond this list.{leader_clause}\n"
            f"• If the angle is a head-to-head, every comparison must be between the listed entities.\n"
            f"• Reject any urge to widen the narrative to 'the rest of the grid'."
        )

    angle_note = (
        f"\n\nThis story has a SINGLE, SPECIFIC editorial angle. Stay tightly on it:\n"
        f"ANGLE: {angle_title}\nWHAT TO COVER: {angle_focus_text}"
        f"{focus_lock}{window_hint}{signals_text}"
        if angle_title else ""
    )

    # ── Angle-conditional comparison clauses (Fix 3) ──────────────────────────
    # Replaces the old unconditional "MANDATORY: teammate comparison AND leader
    # comparison" block. Comparisons are only requested when the angle text
    # actually invites them — otherwise a tight subject like
    # "VER's S2 error on lap 4" gets force-padded with grid-wide context.
    comparison_clauses: list[str] = []
    if is_h2h and len(extra_dns) >= 1:
        # Head-to-head angle — the rivals named in the title ARE the story.
        comparison_clauses.append(
            "• REQUIRED: every paragraph compares the named rivals head-to-head "
            "(pace, sector, degradation, or pit delta) with a quantified delta + lap citation."
        )
    elif wants_teammate:
        comparison_clauses.append(
            "• REQUIRED: at least ONE quantified teammate comparison (pace, sector, "
            "degradation, or pit delta) — the angle invites it."
        )
    if wants_leader and not is_h2h:
        comparison_clauses.append(
            "• REQUIRED: at least ONE quantified comparison vs the session leader / "
            "podium reference — the angle invites it."
        )
    if not comparison_clauses:
        comparison_clauses.append(
            "• Comparisons: only introduce a teammate or leader reference if it directly "
            "supports the angle. Do NOT add comparisons for their own sake — they dilute focus."
        )
    comparison_block = "\n".join(comparison_clauses)

    if kind == "driver":
        leader_step_note = (
            " The leader's laps are in `sliceDriverNumbers` — the angle invites a leader "
            "comparison."
            if wants_leader else
            " The leader is NOT in the slice (the angle does not invite a leader "
            "comparison). A `baseline.leaderFastestLapSec` is exposed as a single "
            "reference-only anchor — use it sparingly and DO NOT widen the narrative "
            "to the leader."
        )
        analyze_desc = f"""
        Your single job: produce a technical brief that serves ONLY the angle below.
        Do not survey the session. Do not chase "the most interesting" data. The
        analyst's value here is depth on the angle, not breadth.{angle_note}{context_note}{brief_note}

        Then — and only then — gather the data the angle needs:

        STEP 1 — call scope_context_pack(). It returns the focal driver's laps, the
        teammate's laps, stints, lap-telemetry aggregates and scope-filtered signals,
        already filtered to the angle's lap window AND the FOCUS LOCK driver set.{leader_step_note}
        Anchor every comparison to `sliceDriverNumbers` and `teammateDriverNumber`.

        STEP 2 — for any sentence-level claim that needs raw-trace evidence (corner-exit
        speed, brake point, gear shift, DRS deployment), call
        read_lap_telemetry_trace(lap=<N>, channels=["speed","throttle","brake","drs","nGear"]).
        Only call it for laps you are about to cite — it is the most expensive tool.

        STEP 3 — use the focal_* tools when (and ONLY when) the angle needs a metric
        the context pack does not already cover:
          • focal_tire_degradation() for per-stint deg of the focal driver
          • focal_gap(other_driver_number=<N>, lap_number=<L>) for cumulative gap
            (N must be in sliceDriverNumbers — anything else is rejected)
          • focal_lap_percentile(lap_number=<L>) for a single 'top X%' anchor
          • focal_lap_summary() for mean/std/fastest across the FOCUS set only
        You do NOT have any session-wide tools. The story is about the FOCUS LOCK
        entities only; the tools enforce this server-side.

        Output: a tight technical brief that stays on the angle. Every paragraph in the
        brief must answer a sub-question the angle raises. Every numeric claim cites a
        lap number from the lap window and references drivers by car number from the
        sliceDriverNumbers set. No grid-wide summaries.
        """
        write_desc = f"""
        Write a 350-550 word editorial on {scope_label} in session {session_key},
        focused ENTIRELY on the angle below. The angle is the story — not a
        starting point, not a launch pad.{angle_note}{context_note}
        Requirements: stay on the angle; 3-5 paragraph blocks; optional heading + quote;
        premium motorsport tone.
        Comparison policy (angle-conditional — DO NOT add comparisons the angle does not invite):
{comparison_block}
        Reference drivers by abbreviation + car number (e.g. "VER #1") and cite the lap number for every delta.
        Output ONLY JSON: {{"title": "...", "summary": "...", "content": [...]}}
        Use block types: paragraph, heading, quote, stat (meta.value).
        CRITICAL: Output ONLY narrative blocks. NEVER include code blocks, backticks, ``` fences,
        JSON, graphId references, afterBlockIndex, or any chart specification inside content[].text.
        Graphs are inserted by a separate downstream stage — do not mention them, do not embed them,
        do not reference graph IDs. If you include any code fence or JSON the entire response is invalid.
        """
        signals_desc = ""
    elif kind == "team":
        team_name = scope.get("teamName") or tid
        leader_step_note = (
            " The leader's laps are in `sliceDriverNumbers` — the angle invites a leader "
            "comparison."
            if wants_leader else
            " The leader is NOT in the slice. A `baseline.leaderFastestLapSec` is exposed "
            "as a single reference-only anchor — use it sparingly."
        )
        analyze_desc = f"""
        Your single job: produce a technical brief that serves ONLY the angle below.
        Do not survey the team's entire race. The brief's value here is depth on the
        angle, not breadth across both drivers' afternoons.{angle_note}{context_note}{brief_note}

        Then gather the data the angle needs:

        STEP 1 — call scope_context_pack(). It returns BOTH drivers on the team (plus
        any drivers the angle explicitly cites), already filtered to the angle's lap
        window AND the FOCUS LOCK driver set.{leader_step_note}
        Anchor every comparison to `sliceDriverNumbers`.

        STEP 2 — use the focal_* tools ONLY when the angle needs a metric the context
        pack does not already cover:
          • focal_tire_degradation(driver_number=<N>) per team driver
          • focal_gap(other_driver_number=<N>, lap_number=<L>) for between-car deltas
            (N must be in sliceDriverNumbers — anything else is rejected)
          • focal_lap_summary() for mean/std/fastest across the FOCUS set only
        You do NOT have any session-wide tools.

        Output: a team-level technical brief that stays on the angle. Every paragraph
        answers a sub-question the angle raises. Every numeric claim cites a lap from
        the lap window and references drivers by car number from sliceDriverNumbers.
        """
        signals_desc = ""
        write_desc = f"""
        Write a 400-600 word editorial about {team_name} in session {session_key},
        focused ENTIRELY on the angle below. The angle IS the story.{angle_note}{context_note}
        Cover both drivers only as the angle requires; every claim cites a lap or metric.
        3-5 paragraph blocks.
        Comparison policy (angle-conditional — DO NOT add comparisons the angle does not invite):
{comparison_block}
        Output ONLY JSON: {{"title": "...", "summary": "...", "content": [...]}}
        Use block types: paragraph, heading, quote, stat (meta.value).
        CRITICAL: Output ONLY narrative blocks. NEVER include code blocks, backticks, ``` fences,
        JSON, graphId references, afterBlockIndex, or any chart specification inside content[].text.
        Graphs are inserted by a separate downstream stage — do not mention them, do not embed them,
        do not reference graph IDs. If you include any code fence or JSON the entire response is invalid.
        """

    else:  # session
        analyze_desc = f"""
        Analyze the telemetry session {session_key} from MongoDB using the read_session tool.{context_note}
        Identify:
        1. The top 5 most technically significant driver performances with specific lap numbers and times.
        2. Key tire degradation patterns and when they diverged from the model.
        3. Any braking point or entry speed anomalies.
        4. ERS deployment patterns at critical overtaking zones.
        Output a structured technical brief with driver names, lap numbers, and specific metrics.
        """
        signals_desc = f"""
        Using the technical brief from the analyst:
        1. Identify and rank the top 5 strategic signals from session {session_key}.
        2. For each signal: lap number, location, priority (high/med/low), one-sentence title, meaning, implication.
        3. Identify which signal had the greatest race outcome impact.
        Output as a JSON array of signal objects.
        """
        write_desc = f"""
        Using the technical brief and signal list, write a full editorial story about session {session_key}.{context_note}
        Requirements:
        - 600–900 words total
        - Four to six content blocks of type 'paragraph', plus one optional 'heading' and one 'quote'
        - Lead: start mid-action (not with background)
        - Every factual claim must cite the lap number and/or specific metric
        - Tone: premium motorsport journalism — clinical but compelling

        Output ONLY a JSON object:
        {{"title": "...", "summary": "...", "content": [{{"type": "paragraph", "text": "..."}}]}}

        Use block types: paragraph, heading, quote, stat (with meta.value field).
        CRITICAL: Output ONLY narrative blocks. NEVER include code blocks, backticks, ``` fences,
        JSON, graphId references, afterBlockIndex, or any chart specification inside content[].text.
        Graphs are inserted by a separate downstream stage — do not mention them, do not embed them,
        do not reference graph IDs. If you include any code fence or JSON the entire response is invalid.
        """

    task_analyze = Task(
        description=analyze_desc,
        expected_output="A structured technical brief with driver names, lap numbers, and specific metrics.",
        agent=telemetry_analyst,
    )

    if kind == "session":
        task_signals = Task(
            description=signals_desc,
            expected_output="JSON array of signal objects with lap, priority, title, meaning, implication.",
            agent=signal_detector,
            context=[task_analyze],
        )
        task_write_context = [task_analyze, task_signals]
    else:
        task_signals = None
        task_write_context = [task_analyze]

    task_write = Task(
        description=write_desc,
        expected_output='JSON object with title, summary, content array.',
        agent=story_writer,
        context=task_write_context,
    )

    # Verifier only runs for session scope (cheaper crew for driver/team)
    if kind == "session":
        task_verify_context = task_write_context + [task_write]
        task_verify = Task(
            description=f"""
            Review the story draft and verify:
            1. All lap times cited match actual data in MongoDB for session {session_key}.
            2. All driver names and numbers are correct.
            3. All deltas and percentages are accurate to within 0.1s.
            If corrections are needed, output the corrected story JSON.
            If no corrections needed, output the original story JSON unchanged.
            Output ONLY the final story JSON object (same schema as the writer's output).
            """,
            expected_output='Final verified story JSON object.',
            agent=fact_checker,
            context=task_verify_context,
        )
        crew = Crew(
            agents=[telemetry_analyst, signal_detector, story_writer, fact_checker],
            tasks=[task_analyze, task_signals, task_write, task_verify],
            process=Process.sequential,
            verbose=True,
        )
    else:
        crew = Crew(
            agents=[telemetry_analyst, story_writer],
            tasks=[task_analyze, task_write],
            process=Process.sequential,
            verbose=True,
        )

    return crew


def run_story_crew(
    session_key: str,
    story_id: str,
    story_run_id: str,
    context: str = "",
    scope: dict | None = None,
    shared_brief: str | None = None,
    capture_brief: bool = False,
    final_status: str | None = "done",
    angle_spec: dict | None = None,
) -> str | None:
    """Execute the crew, patch the resulting story to the backend, and
    optionally return the analyst brief for reuse by downstream scoped crews.
    """
    scope = scope or {"kind": "session"}
    label = _scope_label(scope)
    angle_label = (angle_spec or {}).get("title", "—")
    _update_run_log(story_run_id, f"story_crew[{label}][{angle_label}]: starting CrewAI pipeline")

    # Resolve driver/team mentions in the angle once and reuse for both the
    # crew (tool scoping + prompt FOCUS LOCK) and the post-crew verifier
    # (slice must match what the analyst saw).
    angle_entities: dict | None = None
    if angle_spec:
        try:
            sess_doc = db_client.telemetry_sessions().find_one(
                {"sessionKey": session_key}, {"drivers": 1, "_id": 0}
            ) or {}
            roster = sess_doc.get("drivers", []) or []
            angle_entities = _resolve_angle_entities(angle_spec, roster)
            if angle_entities and angle_entities.get("descriptors"):
                _update_run_log(
                    story_run_id,
                    f"story_crew[{label}]: angle FOCUS LOCK → {', '.join(angle_entities['descriptors'])}",
                )
        except Exception as e:
            logger.warning("entity resolve failed for %s: %s", label, e)

    try:
        crew = build_story_crew(
            session_key, story_id, story_run_id, context,
            scope=scope, shared_brief=shared_brief, angle_spec=angle_spec,
            angle_entities=angle_entities,
        )
        result = crew.kickoff()
        raw_output = str(result)
    except Exception as e:
        logger.error("CrewAI kickoff failed for %s: %s", label, e)
        _update_run_log(story_run_id, f"story_crew[{label}]: FAILED — {e}")
        if scope.get("kind") == "session":
            # Only the session crew failure marks the whole run failed; scoped failures
            # are logged but the run keeps going.
            db_client.story_runs().update_one(
                {"_id": ObjectId(story_run_id)},
                {"$set": {"status": "failed", "error": str(e)}},
            )
        return None

    # crew.kickoff() returns the LAST task's output. For session crews that is the
    # Fact Checker (verified story JSON), but driver/team crews end with the Chart
    # Curator, whose output is a JSON *array* of embed instructions — not the story.
    # Pull the story object from the responsible task explicitly so driver/team
    # narratives aren't lost.
    def _story_obj_from_role(role: str) -> dict | None:
        for task in crew.tasks:
            if task.agent.role == role and task.output:
                obj = _extract_json_object(str(task.output))
                if obj and "content" in obj:
                    return obj
        return None

    story_data = (
        _story_obj_from_role("F1 Data Fact Checker")
        or _story_obj_from_role("Motorsport Journalist")
    )

    if not story_data or "content" not in story_data:
        logger.warning("Could not parse story JSON from %s crew; using fallback", label)
        writer_raw = ""
        for task in crew.tasks:
            if task.agent.role == "Motorsport Journalist" and task.output:
                writer_raw = str(task.output)
                break
        story_data = {
            "title":   _scope_title_prefix(scope, session_key),
            "summary": "AI-generated analysis (manual review recommended)",
            "content": [{"type": "paragraph", "text": (writer_raw or raw_output)[:2000]}],
        }

    content_blocks = _sanitize_content_blocks(story_data.get("content", []))

    # Run the deterministic LangGraph pipeline to generate and embed charts
    from app.pipelines.story_graph_pipeline import run_story_graph_pipeline
    _update_run_log(story_run_id, f"story_crew[{label}]: Running LangGraph chart embedding pipeline")
    lap_window = _lap_window_from_angle(angle_spec, default=None)
    content_blocks = run_story_graph_pipeline(session_key, story_id, scope, angle_spec, content_blocks, lap_window=lap_window)

    # Angle-aware telemetry clip injection — adds a `telemetry_clip` reference
    # block the Frontend's TelemetryClipPlayer resolves to animated track +
    # speed/throttle/brake traces. Reference-only: actual telemetry is fetched
    # at render time from the Backend clip resolver
    # (GET /api/telemetry/sessions/:sessionKey/clip). Best-effort: any failure
    # is logged but never blocks the story patch.
    try:
        from app.pipelines.telemetry_clip import select_telemetry_clip_block, insert_clip_block
        clip_block = select_telemetry_clip_block(
            session_key, scope, angle_spec=angle_spec, angle_entities=angle_entities,
        )
        if clip_block:
            content_blocks = insert_clip_block(content_blocks, clip_block)
            meta = clip_block.get("meta", {})
            _update_run_log(
                story_run_id,
                f"story_crew[{label}]: telemetry_clip → laps {meta.get('lapFrom')}–{meta.get('lapTo')} "
                f"drivers={meta.get('driverNumbers')} mode={meta.get('mode')}"
            )
        else:
            _update_run_log(story_run_id, f"story_crew[{label}]: telemetry_clip skipped (no resolvable window/drivers)")
    except Exception as e:
        logger.warning("telemetry_clip injection failed for %s: %s", label, e)
        _update_run_log(story_run_id, f"story_crew[{label}]: telemetry_clip injection error — {e}")

    # Lightweight grounding check on cited lap numbers (driver/team crews skip the
    # fact-checker entirely). Non-destructive: flags out-of-range citations.
    flags = _check_lap_citations(session_key, content_blocks)
    if flags:
        _update_run_log(story_run_id, f"story_crew[{label}]: ⚠ {flags} cited lap number(s) outside session range — review")

    # Programmatic claim verifier — driver/team crews skip the FactChecker, so
    # this is the strongest grounding check they get. It re-materialises the
    # exact slice the analyst worked from and compares every "lap N" + lap-time
    # citation against actual data. Mismatches do NOT block the story (the
    # admin reviews drafts) but tag it `needsReview` and append to run logs.
    needs_review = False
    review_reasons: list[str] = []
    if scope.get("kind") in ("driver", "team"):
        try:
            lap_window = _lap_window_from_angle(angle_spec, default=None)
            extra_dns_for_slice = [
                n for n in ((angle_entities or {}).get("driverNumbers") or [])
                if isinstance(n, int)
            ]
            slice_doc = materialize_context_slice(
                session_key, scope, lap_window,
                extra_driver_numbers=extra_dns_for_slice or None,
            )
            warnings = _verify_claims_against_slice(
                content_blocks, slice_doc,
                lap_window=lap_window,
                focal_driver_number=scope.get("driverNumber"),
            )
            if warnings:
                needs_review = True
                review_reasons = warnings[:10]  # cap to keep logs readable
                for w in review_reasons:
                    _update_run_log(story_run_id, f"story_crew[{label}]: ⚠ verifier — {w}")
                _update_run_log(
                    story_run_id,
                    f"story_crew[{label}]: verifier flagged {len(warnings)} claim mismatch(es); story marked needsReview",
                )
        except Exception as e:
            # Verifier is best-effort. Never let it block the patch.
            logger.warning("claim verifier crashed for %s: %s", label, e)
            _update_run_log(story_run_id, f"story_crew[{label}]: verifier crashed — {e}")

    # LLM angle-coherence judge — semantic counterpart to the numeric verifier.
    # The claim verifier above catches out-of-window lap numbers and wrong lap
    # times; it cannot tell whether the prose actually serves the angle. The
    # judge fills that gap with a single LLM call against the angle + story.
    # Best-effort: returns `available=False` when no LLM is configured, in
    # which case we don't touch `needs_review`.
    coherence_score: int | None = None
    if scope.get("kind") in ("driver", "team") and (angle_spec or {}).get("title"):
        try:
            verdict = _judge_angle_coherence(
                angle_spec,
                content_blocks,
                focus_descriptors=list((angle_entities or {}).get("descriptors") or []),
            )
            if verdict.available:
                coherence_score = verdict.score
                _update_run_log(
                    story_run_id,
                    f"story_crew[{label}]: angle-coherence judge → {verdict.score}/10"
                    + (f" ({'; '.join(verdict.reasons)})" if verdict.reasons else ""),
                )
                if verdict.is_off_angle:
                    needs_review = True
                    for r in verdict.reasons:
                        review_reasons.append(f"angle-coherence: {r}")
                    if not verdict.reasons:
                        review_reasons.append(
                            f"angle-coherence: judge scored {verdict.score}/10 (below threshold)"
                        )
                    _update_run_log(
                        story_run_id,
                        f"story_crew[{label}]: ⚠ story scored off-angle ({verdict.score}/10); marked needsReview",
                    )
        except Exception as e:
            logger.warning("angle-coherence judge crashed for %s: %s", label, e)
            _update_run_log(story_run_id, f"story_crew[{label}]: coherence judge crashed — {e}")

    # Patch the story in the backend with scope metadata.
    # Stories land as drafts — admin must review and publish manually.
    try:
        patch_body = {
            "title":    story_data.get("title") or _scope_title_prefix(scope, session_key),
            "summary":  story_data.get("summary", ""),
            "content":  content_blocks,
            "category": _scope_category(scope),
            "scope":    {
                "kind":         scope.get("kind", "session"),
                "driverNumber": scope.get("driverNumber"),
                "teamId":       scope.get("teamId"),
                "teamName":     scope.get("teamName"),
            },
            "tags":        [(angle_spec or {}).get("priority")] if (angle_spec or {}).get("priority") else [],
            "status":      "draft",
            "aiGenerated": True,
        }
        if needs_review:
            patch_body["needsReview"] = True
            patch_body["reviewReasons"] = review_reasons[:10]
        if coherence_score is not None:
            patch_body["angleCoherenceScore"] = coherence_score
        _backend_patch(f"/api/stories/{story_id}", patch_body)
        _update_run_log(
            story_run_id,
            f"story_crew[{label}]: story patched ({len(content_blocks)} blocks)"
        )
    except Exception as e:
        logger.error("Failed to patch story %s: %s", label, e)

    # Mark the run done only when the caller says so (session crew, or fanout finaliser).
    # Callers that manage run lifecycle themselves pass final_status=None.
    if final_status is not None:
        db_client.story_runs().update_one(
            {"_id": ObjectId(story_run_id)},
            {"$set": {"status": final_status}},
        )
    _update_run_log(story_run_id, f"story_crew[{label}]: complete")

    if capture_brief:
        for task in crew.tasks:
            if task.agent.role == "F1 Telemetry Analyst" and task.output:
                return str(task.output)
    return None


def discover_angles_for_scope(
    session_key: str,
    scope: dict,
    shared_brief: str | None = None,
    max_angles: int = 4,
) -> list[dict]:
    """Run a single 'Angle Scout' agent that proposes interesting, data-backed
    analysis angles for one driver/team scope.

    Returns a list of normalised dicts: {title, focus, rationale, priority,
    supportingSignalIds}. Returns [] on failure or for the session scope.
    """
    kind = scope.get("kind")
    label = _scope_label(scope)
    dn = scope.get("driverNumber")
    tid = scope.get("teamId")

    if kind == "driver":
        read_hint = f"read_signals(sessionKey='{session_key}', driverNumber={dn})"
    elif kind == "team":
        read_hint = f"read_signals(sessionKey='{session_key}', teamId='{tid}')"
    else:
        return []

    llm = get_llm()
    brief_note = f"\n\nSession analyst brief for context:\n{shared_brief[:4000]}" if shared_brief else ""

    scout = Agent(
        role="F1 Story Angle Scout",
        goal=f"Surface the freshest, most distinct story angles for {label} in session {session_key}",
        backstory=(
            "You are a motorsport features editor. Before any story is written you scan the race data "
            "for the angles worth telling — the surprising under/over-performance, the strategic gamble, "
            "the head-to-head that defined someone's afternoon. You only propose angles the numbers can back."
        ),
        llm=llm,
        tools=[read_signals, read_session, session_lap_summary,
               compute_tire_degradation, compute_lap_percentile, compute_gap_between_drivers],
        verbose=True,
        max_iter=3,
    )

    task = Task(
        description=f"""
        Survey the data for {label} in session {session_key} and propose the {max_angles} MOST interesting,
        DISTINCT analysis angles a motorsport journalist could each write a separate story about.{brief_note}
        Ground every angle in real numbers: use {read_hint}, read_session, session_lap_summary and the
        compute_* tools. Each angle must be specific and data-backed (NOT generic), and must not overlap
        with the others.
        For each angle output an object with EXACTLY these fields:
          - "title": a punchy headline (<= 90 chars)
          - "focus": 1-2 sentences telling a writer exactly what to cover. ONLY mention a teammate
                     or leader comparison if the angle genuinely turns on it — otherwise leave them
                     out so the writer doesn't drag them in.
          - "rationale": why this is interesting — the specific data point that makes it a story
          - "priority": one of "high", "med", "low" by how compelling the angle is
          - "lapWindow": REQUIRED object {{"start": <int>, "end": <int>}} — the inclusive lap range
                     this angle covers. For a stint story this is the stint's laps; for a single
                     incident it is a tight window around it (±3-5 laps); for a session-long arc
                     (e.g. degradation across the race) use the full lap range of the race. NEVER
                     leave this null — without it the writer is given the entire race as raw data.
          - "supportingSignalIds": array of signal id strings (from read_signals) that back this angle (may be empty)
        Output ONLY a JSON array of up to {max_angles} objects. No prose, no code fences, no markdown.
        """,
        expected_output="JSON array of angle objects with title, focus, rationale, priority, lapWindow, supportingSignalIds.",
        agent=scout,
    )

    crew = Crew(agents=[scout], tasks=[task], process=Process.sequential, verbose=True)
    try:
        result = crew.kickoff()
    except Exception as e:
        logger.error("Angle scout failed for %s: %s", label, e)
        return []

    arr = _extract_json_array(str(result)) or []
    out: list[dict] = []
    for a in arr[:max_angles]:
        if not isinstance(a, dict):
            continue
        title = str(a.get("title", "")).strip()
        focus = str(a.get("focus", "")).strip()
        if not title or not focus:
            continue
        priority = a.get("priority", "med")
        if priority not in ("high", "med", "low"):
            priority = "med"
        sig_ids = a.get("supportingSignalIds")
        sig_ids = sig_ids if isinstance(sig_ids, list) else []

        # lapWindow — REQUIRED but tolerated as missing on legacy/garbage output.
        # Accept dict {start, end}, list/tuple [start, end], or null. Drop the
        # field entirely when it can't be parsed into a sane positive range,
        # so downstream (`lap_window_from_angle`) falls through to its other
        # resolvers instead of silently treating broken windows as full-session.
        lap_window: dict | None = None
        raw_win = a.get("lapWindow")
        if isinstance(raw_win, dict):
            s, e = raw_win.get("start"), raw_win.get("end")
        elif isinstance(raw_win, (list, tuple)) and len(raw_win) == 2:
            s, e = raw_win[0], raw_win[1]
        else:
            s, e = None, None
        try:
            si, ei = int(s), int(e)
            if si > 0 and ei >= si:
                lap_window = {"start": si, "end": ei}
        except (TypeError, ValueError):
            lap_window = None

        angle: dict = {
            "title":               title[:300],
            "focus":               focus[:2000],
            "rationale":           str(a.get("rationale", "")).strip()[:2000],
            "priority":            priority,
            "supportingSignalIds": [str(s) for s in sig_ids if s],
        }
        if lap_window is not None:
            angle["lapWindow"] = lap_window
        out.append(angle)
    return out
