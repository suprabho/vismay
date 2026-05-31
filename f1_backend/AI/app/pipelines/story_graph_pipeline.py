"""
Story → Graph embedding pipeline (LangGraph).

Flow:
  load_available_graphs  → fetch scoped graph_specs the story can cite
  analyze_story_needs    → LLM picks existing graphs and/or net-new charts
  generate_requested_graphs → materialise net-new charts via story_graphs.py
  embed_graphs           → splice graph_embed blocks into the story content;
                           if the LLM emitted nothing usable, auto-embed up to
                           2 of the highest-ranked available graphs so the
                           frontend never receives a chart-less story.
"""

from __future__ import annotations

import json
import logging
from typing import TypedDict, Optional

from pydantic import BaseModel, ConfigDict, Field, AliasChoices, field_validator
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

from app.config import settings
from app.tools.story_graphs import create_telemetry_trace_graph, create_pace_projection_graph

logger = logging.getLogger(__name__)


# ─── Schema ─────────────────────────────────────────────────────────────────

_VALID_GRAPH_TYPES = {"telemetry_trace", "pace_projection", "existing_session_graph"}
_VALID_CHANNELS = {"speed", "throttle", "brake", "drs", "nGear", "rpm"}


class GraphInstruction(BaseModel):
    # Tolerate LLM synonyms — Gemini sometimes drifts on field naming.
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    graph_type: str = Field(
        description="One of 'telemetry_trace', 'pace_projection', 'existing_session_graph'",
        validation_alias=AliasChoices("graph_type", "graphType", "type"),
    )
    after_block_index: int = Field(
        description="Index of the content block (0-indexed) after which the graph should be embedded.",
        validation_alias=AliasChoices(
            "after_block_index", "afterBlockIndex", "insert_after_block",
            "insertAfterBlock", "insert_after_block_index", "block_index",
        ),
    )
    caption: str = Field(
        default="",
        description="Short caption summarising what the graph shows.",
        validation_alias=AliasChoices("caption", "description", "summary", "title"),
    )
    driver_numbers: list[int] = Field(
        default_factory=list,
        description="Driver numbers featured in the graph.",
        validation_alias=AliasChoices("driver_numbers", "driverNumbers", "drivers"),
    )
    lap_number: Optional[int] = Field(
        default=None,
        description="Lap number for graph_type=telemetry_trace.",
        validation_alias=AliasChoices("lap_number", "lapNumber", "lap"),
    )
    channel: Optional[str] = Field(
        default=None,
        description="Telemetry channel for graph_type=telemetry_trace (speed|throttle|brake|drs|nGear|rpm).",
        validation_alias=AliasChoices("channel", "telemetry_channel", "metric"),
    )
    existing_graph_id: Optional[str] = Field(
        default=None,
        description="MongoDB _id of an existing graph_spec to reuse.",
        validation_alias=AliasChoices(
            "existing_graph_id", "existingGraphId", "graph_id", "graphId",
        ),
    )

    @field_validator("driver_numbers", mode="before")
    @classmethod
    def _coerce_driver_numbers(cls, v):
        if v is None:
            return []
        if isinstance(v, (int, str)):
            v = [v]
        if not isinstance(v, list):
            return []
        out: list[int] = []
        for item in v:
            try:
                out.append(int(item))
            except (TypeError, ValueError):
                continue
        return out


class GraphNeedsOutput(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    instructions: list[GraphInstruction] = Field(
        default_factory=list,
        validation_alias=AliasChoices("instructions", "graphs", "items"),
    )


class StoryGraphState(TypedDict):
    session_key: str
    story_id: str
    scope: dict
    angle_spec: dict
    content_blocks: list[dict]
    graph_instructions: list[dict]
    available_graphs: list[dict]
    default_driver_numbers: list[int]


# ─── LLM bootstrap ──────────────────────────────────────────────────────────

def build_langchain_chat_model():
    p = settings.LLM_PROVIDER
    t = settings.LLM_TEMPERATURE
    if p == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=settings.OLLAMA_MODEL, base_url=settings.OLLAMA_BASE_URL, temperature=t)
    if p == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL, google_api_key=settings.GEMINI_API_KEY, temperature=t
        )
    if p == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY, temperature=t)
    if p == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=settings.ANTHROPIC_API_KEY, temperature=t)
    raise RuntimeError(f"Unsupported LLM provider for LangGraph structured output: {p}")


# ─── Helpers ────────────────────────────────────────────────────────────────

# Free-form labels Gemini / GPT have been observed to emit. Mapped to the
# canonical dispatch enum so a verbose label like "Pace Comparison Chart"
# still resolves to a real generator.
_GRAPH_TYPE_ALIASES = {
    "telemetry_trace": "telemetry_trace",
    "telemetry trace": "telemetry_trace",
    "telemetry": "telemetry_trace",
    "speed trace": "telemetry_trace",
    "throttle trace": "telemetry_trace",
    "brake trace": "telemetry_trace",
    "lap trace": "telemetry_trace",
    "pace_projection": "pace_projection",
    "pace projection": "pace_projection",
    "pace projection chart": "pace_projection",
    "pace comparison": "pace_projection",
    "pace comparison chart": "pace_projection",
    "pace_comparison_chart": "pace_projection",
    "lap time projection": "pace_projection",
    "lap-time projection": "pace_projection",
    "projection": "pace_projection",
    "forecast": "pace_projection",
    "existing_session_graph": "existing_session_graph",
    "existing": "existing_session_graph",
    "existing graph": "existing_session_graph",
    "session graph": "existing_session_graph",
}


def _normalize_graph_type(raw: str | None, has_existing_id: bool) -> str:
    """Coerce LLM-emitted graph_type strings to the canonical enum.
    Returns "" when nothing sensible can be inferred."""
    if not raw:
        return "existing_session_graph" if has_existing_id else ""
    norm = str(raw).strip().lower()
    if norm in _GRAPH_TYPE_ALIASES:
        return _GRAPH_TYPE_ALIASES[norm]
    if norm in _VALID_GRAPH_TYPES:
        return norm
    if "telemetry" in norm or "trace" in norm or any(k in norm for k in ("speed", "throttle", "brake", "drs", "gear", "rpm")):
        return "telemetry_trace"
    if "pace" in norm or "projection" in norm or "forecast" in norm or "lap time" in norm:
        return "pace_projection"
    if "existing" in norm or has_existing_id:
        return "existing_session_graph"
    return ""


def _scope_query(session_key: str, scope: dict) -> dict:
    """Mirror read_graph_specs scoping: include session-wide graphs alongside
    the focal driver/team-scoped graphs."""
    query: dict = {"sessionKey": session_key}
    dn = scope.get("driverNumber")
    tid = scope.get("teamId")
    if dn is not None:
        try:
            dn_int = int(dn)
            query["$or"] = [
                {"driverNumber": dn_int},
                {"scopeKind": "session"},
                {"driverNumber": {"$exists": False}, "teamId": {"$exists": False}},
            ]
        except (TypeError, ValueError):
            pass
    elif tid:
        query["$or"] = [
            {"teamId": tid},
            {"scopeKind": "session"},
            {"driverNumber": {"$exists": False}, "teamId": {"$exists": False}},
        ]
    return query


def _default_driver_numbers(scope: dict) -> list[int]:
    dn = scope.get("driverNumber")
    if dn is None:
        return []
    try:
        return [int(dn)]
    except (TypeError, ValueError):
        return []


def _resolve_existing_graph_id(
    instr: dict, available: list[dict]
) -> str | None:
    """Validate the LLM's existing_graph_id; fall back to a title/caption
    match against the candidate list so a verbose-but-meaningful caption
    still resolves to a real spec."""
    if not available:
        return None
    by_id = {g["id"]: g for g in available}
    eid = instr.get("existing_graph_id")
    if eid and eid in by_id:
        return eid
    # Caption→title heuristic
    caption = (instr.get("caption") or "").strip().lower()
    if caption:
        for g in available:
            title = (g.get("title") or "").strip().lower()
            if title and (title in caption or caption in title):
                return g["id"]
        # Token overlap (use words >3 chars to avoid common short words)
        caption_tokens = {w for w in caption.replace("-", " ").split() if len(w) > 3}
        best_id, best_overlap = None, 0
        for g in available:
            title_tokens = {
                w for w in (g.get("title") or "").lower().replace("-", " ").split() if len(w) > 3
            }
            overlap = len(caption_tokens & title_tokens)
            if overlap > best_overlap:
                best_overlap = overlap
                best_id = g["id"]
        if best_overlap >= 2:
            return best_id
    return None


def _rank_available(g: dict, scope_kind: str) -> int:
    """Lower rank = more relevant. Drives fallback embedding order."""
    score = 0
    if g.get("scopeKind") == scope_kind:
        score -= 10
    elif g.get("scopeKind") == "session":
        score -= 4
    gtype = (g.get("type") or "").lower()
    if "multi_line" in gtype: score -= 5
    if "projection" in gtype: score -= 4
    if "bar" in gtype:        score -= 3
    return score


# ─── Pipeline nodes ─────────────────────────────────────────────────────────

def load_available_graphs(state: StoryGraphState) -> StoryGraphState:
    """Fetch scoped graph_specs so the LLM can cite real chart IDs."""
    # Imported lazily so this module remains import-safe in contexts
    # without a Mongo connection (tests, schema introspection).
    from app.tools.mongo_tool import db_client

    session_key = state["session_key"]
    scope = state.get("scope") or {}
    query = _scope_query(session_key, scope)
    available: list[dict] = []
    try:
        cursor = db_client.graph_specs().find(
            query,
            {"_id": 1, "title": 1, "type": 1, "scopeKind": 1, "driverNumber": 1, "teamId": 1},
        )
        for doc in cursor:
            available.append({
                "id": str(doc["_id"]),
                "title": doc.get("title", "") or "",
                "type": doc.get("type", "") or "",
                "scopeKind": doc.get("scopeKind", "") or "",
                "driverNumber": doc.get("driverNumber"),
                "teamId": doc.get("teamId"),
            })
    except Exception as e:
        logger.warning(f"load_available_graphs: query failed for {session_key}: {e}")

    return {
        "available_graphs": available,
        "default_driver_numbers": _default_driver_numbers(scope),
    }


def analyze_story_needs(state: StoryGraphState) -> StoryGraphState:
    """LLM picks which graphs (existing or net-new) should be embedded and where."""
    available = state.get("available_graphs") or []
    if not state["content_blocks"]:
        return {"graph_instructions": []}

    # Compact candidate list for the prompt — keep it short to avoid blowing
    # context. Sorted by relevance to the scope so the LLM sees the best
    # candidates first.
    scope_kind = (state.get("scope") or {}).get("kind", "session")
    ranked = sorted(available, key=lambda g: _rank_available(g, scope_kind))
    candidate_listing = [
        {"id": g["id"], "type": g["type"], "title": g["title"], "scope": g["scopeKind"]}
        for g in ranked[:25]  # cap
    ]

    llm = build_langchain_chat_model()
    structured_llm = llm.with_structured_output(GraphNeedsOutput)

    blocks_text = "\n".join(
        f"[{i}] {b.get('type')}: {b.get('text', '')}"
        for i, b in enumerate(state["content_blocks"])
    )

    candidates_json = json.dumps(candidate_listing, ensure_ascii=False)
    default_dn = state.get("default_driver_numbers") or []
    default_dn_str = ", ".join(str(d) for d in default_dn) if default_dn else "none"

    system_prompt = (
        "You are an F1 data journalist deciding which charts strengthen which paragraphs of a story. "
        "Your job is to return embedding instructions that the rendering pipeline can execute.\n\n"
        "RULES:\n"
        "1. STRONGLY PREFER reusing existing graphs from the AVAILABLE_GRAPHS list. "
        "Use graph_type='existing_session_graph' and set existing_graph_id to the exact id from the list.\n"
        "2. Use graph_type='telemetry_trace' ONLY when a paragraph references a specific lap and a specific "
        "channel (speed, throttle, brake, drs, nGear, rpm). You MUST set lap_number (int), channel (string), "
        "and driver_numbers (list[int]).\n"
        "3. Use graph_type='pace_projection' ONLY when the narrative forecasts pace beyond the laps run. "
        "You MUST set driver_numbers (list[int]).\n"
        "4. Embed 1–3 charts total. Place each AFTER the paragraph it supports. Charts must serve the angle.\n"
        "5. If driver_numbers is required and the story is about a specific driver, default to "
        f"{default_dn_str}.\n"
        "6. Never invent a graph_id — only ids that appear verbatim in AVAILABLE_GRAPHS are valid.\n"
        "7. Return ONLY the structured object the schema requires. No prose, no code fences."
    )
    user_prompt = (
        "ANGLE_FOCUS: {angle_focus}\n\n"
        "AVAILABLE_GRAPHS (JSON):\n{candidates}\n\n"
        "STORY_BLOCKS (one per line, '[idx] type: text'):\n{blocks}"
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("user", user_prompt),
    ])
    chain = prompt | structured_llm

    try:
        res = chain.invoke({
            "angle_focus": (state.get("angle_spec") or {}).get("focus", "Generic session summary"),
            "candidates": candidates_json,
            "blocks": blocks_text,
        })
        instructions = [i.model_dump() for i in res.instructions]
        logger.info(
            f"analyze_story_needs: LLM proposed {len(instructions)} graph instruction(s) "
            f"({len(available)} candidates available)"
        )
        return {"graph_instructions": instructions}
    except Exception as e:
        logger.warning(f"analyze_story_needs failed ({e}); falling back to empty instruction list")
        return {"graph_instructions": []}


def generate_requested_graphs(state: StoryGraphState) -> StoryGraphState:
    """Materialise net-new charts and resolve existing_graph_id references.

    Drops nothing here — drop logic lives in embed_graphs so the audit
    trail is in one place.
    """
    instructions = state["graph_instructions"]
    available = state.get("available_graphs") or []
    default_dn = state.get("default_driver_numbers") or []
    session_key = state["session_key"]

    for instr in instructions:
        # 1. Normalise graph_type — Gemini sometimes emits free-form labels.
        instr["graph_type"] = _normalize_graph_type(
            instr.get("graph_type"),
            has_existing_id=bool(instr.get("existing_graph_id")),
        )
        gtype = instr["graph_type"]
        if not gtype:
            continue

        # 2. Resolve drivers — fall back to scope's focal driver when missing.
        drivers = instr.get("driver_numbers") or []
        if not drivers and gtype in ("telemetry_trace", "pace_projection"):
            drivers = list(default_dn)
            instr["driver_numbers"] = drivers

        # 3. Existing graph — validate against candidate list.
        if gtype == "existing_session_graph":
            resolved = _resolve_existing_graph_id(instr, available)
            if resolved:
                instr["resolved_graph_id"] = resolved
            continue

        # 4. Net-new telemetry trace.
        if gtype == "telemetry_trace":
            lap = instr.get("lap_number")
            channel = instr.get("channel")
            if drivers and lap and channel and channel in _VALID_CHANNELS:
                try:
                    spec = create_telemetry_trace_graph(session_key, drivers, int(lap), channel)
                    if spec and "id" in spec:
                        instr["resolved_graph_id"] = spec["id"]
                except Exception as e:
                    logger.warning(f"telemetry_trace generation failed: {e}")
            continue

        # 5. Net-new pace projection.
        if gtype == "pace_projection":
            if drivers:
                try:
                    spec = create_pace_projection_graph(session_key, drivers, forecast_laps=10)
                    if spec and "id" in spec:
                        instr["resolved_graph_id"] = spec["id"]
                except Exception as e:
                    logger.warning(f"pace_projection generation failed: {e}")
            continue

    return {"graph_instructions": instructions}


def _embed_at(blocks: list[dict], after_idx: int, graph_id: str, caption: str) -> None:
    insert_idx = min(max(0, int(after_idx) + 1), len(blocks))
    blocks.insert(insert_idx, {
        "type": "graph_embed",
        "graphId": graph_id,
        "meta": {"caption": caption},
    })


def embed_graphs(state: StoryGraphState) -> StoryGraphState:
    """Splice graph_embed blocks into the story. If nothing usable came back
    from the LLM, fall back to 1–2 of the best-ranked existing graphs so the
    frontend always receives visual context."""
    blocks = list(state["content_blocks"])
    instructions = state.get("graph_instructions") or []

    # Sort descending so later insertions don't shift earlier indices.
    instructions_sorted = sorted(
        instructions,
        key=lambda x: x.get("after_block_index", 0),
        reverse=True,
    )

    embedded_ids: set[str] = set()
    embedded_count = 0
    dropped = 0
    for instr in instructions_sorted:
        gid = instr.get("resolved_graph_id") or instr.get("existing_graph_id")
        if not gid or gid in embedded_ids:
            if not gid:
                dropped += 1
            continue
        _embed_at(blocks, instr.get("after_block_index", 0) or 0, gid, instr.get("caption", ""))
        embedded_ids.add(gid)
        embedded_count += 1

    if dropped:
        logger.info(f"embed_graphs: dropped {dropped} instruction(s) without a resolvable graphId")

    # Fallback: never ship a chart-less story when candidates exist.
    if embedded_count == 0:
        available = state.get("available_graphs") or []
        if not available:
            logger.info("embed_graphs: no LLM embeds and no available graphs; story has no charts")
            return {"content_blocks": blocks}

        scope_kind = (state.get("scope") or {}).get("kind", "session")
        ranked = [
            g for g in sorted(available, key=lambda g: _rank_available(g, scope_kind))
            if g["id"] not in embedded_ids
        ]
        n_blocks = len(blocks)
        # First chart after intro paragraph; second roughly mid-story if long enough.
        fallback_positions = [0]
        if n_blocks >= 4:
            fallback_positions.append(min(n_blocks - 1, n_blocks // 2))

        for g, after_idx in zip(ranked, fallback_positions):
            _embed_at(blocks, after_idx, g["id"], g.get("title", ""))
            embedded_ids.add(g["id"])
            embedded_count += 1
        logger.info(
            f"embed_graphs: LLM produced no embeds; auto-embedded {embedded_count} fallback chart(s)"
        )

    return {"content_blocks": blocks}


# ─── Pipeline assembly ──────────────────────────────────────────────────────

def build_story_graph_pipeline():
    workflow = StateGraph(StoryGraphState)
    workflow.add_node("load_available_graphs", load_available_graphs)
    workflow.add_node("analyze_story_needs", analyze_story_needs)
    workflow.add_node("generate_requested_graphs", generate_requested_graphs)
    workflow.add_node("embed_graphs", embed_graphs)

    workflow.set_entry_point("load_available_graphs")
    workflow.add_edge("load_available_graphs", "analyze_story_needs")
    workflow.add_edge("analyze_story_needs", "generate_requested_graphs")
    workflow.add_edge("generate_requested_graphs", "embed_graphs")
    workflow.add_edge("embed_graphs", END)

    return workflow.compile()


def run_story_graph_pipeline(
    session_key: str,
    story_id: str,
    scope: dict,
    angle_spec: dict,
    content_blocks: list,
) -> list:
    pipeline = build_story_graph_pipeline()
    state: StoryGraphState = {
        "session_key": session_key,
        "story_id": story_id,
        "scope": scope or {},
        "angle_spec": angle_spec or {},
        "content_blocks": content_blocks,
        "graph_instructions": [],
        "available_graphs": [],
        "default_driver_numbers": [],
    }

    try:
        res = pipeline.invoke(state)
        return res.get("content_blocks", content_blocks)
    except Exception as e:
        logger.error(f"StoryGraphPipeline failed: {e}")
        return content_blocks
