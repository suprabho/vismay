"""
LLM-as-judge angle-coherence gate.

Driver/team story crews skip the fact-checker for cost, and the existing
`verify_claims_against_slice` only catches numeric mismatches (out-of-window
laps, wrong lap times). A story that's completely off-topic but uses real lap
numbers passes that check. This module adds a lightweight semantic check:
given the angle and the rendered story, does the narrative actually serve the
angle, or does it drift?

The judge is best-effort:
  • Gated on `get_llm_optional()` — if no LLM is configured, returns a neutral
    "judge unavailable" result that does NOT flip needsReview.
  • Wraps every LLM call in try/except — any failure returns the same neutral
    result rather than blocking the story.
  • Scores are advisory: callers can decide whether to flip `needsReview`.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from ..config import get_llm_optional
from .json_parse import extract_json_object as _extract_json_object

logger = logging.getLogger(__name__)


# Default threshold: below this, the judge considers the story off-angle and
# the caller should flip needsReview. 6/10 is a deliberately generous bar —
# the judge errs toward "ship it" since stories land as drafts anyway.
COHERENCE_THRESHOLD = 6


@dataclass
class CoherenceVerdict:
    score: int                # 0–10, or -1 when the judge is unavailable
    reasons: list[str]        # short bullet strings; empty when unavailable
    available: bool           # False when no LLM configured / call failed

    @property
    def is_off_angle(self) -> bool:
        """True iff the judge ran AND scored the story below threshold."""
        return self.available and 0 <= self.score < COHERENCE_THRESHOLD


def _story_text(blocks: list[dict] | None, max_chars: int = 4000) -> str:
    """Flatten the story's narrative blocks into a plain string for the judge.
    Graph embeds and other non-text blocks are skipped — the judge cares about
    the words, not the chart layout."""
    if not blocks:
        return ""
    parts: list[str] = []
    total = 0
    for b in blocks:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "graph_embed":
            continue
        text = b.get("text")
        if not isinstance(text, str):
            continue
        text = text.strip()
        if not text:
            continue
        parts.append(text)
        total += len(text)
        if total >= max_chars:
            break
    return "\n\n".join(parts)[:max_chars]


def judge_angle_coherence(
    angle_spec: dict | None,
    blocks: list[dict] | None,
    *,
    focus_descriptors: list[str] | None = None,
) -> CoherenceVerdict:
    """Ask an LLM to score how tightly the rendered story serves the angle.

    The judge sees ONLY the angle (title + focus) and the rendered narrative —
    no telemetry, no signals. Its single job is to detect drift, not to fact-
    check.

    Returns a `CoherenceVerdict`. When the LLM is unavailable or the call
    fails, returns an unavailable verdict — callers should treat that as "no
    signal" and skip flipping needsReview.
    """
    if not isinstance(angle_spec, dict):
        return CoherenceVerdict(score=-1, reasons=[], available=False)

    title = str(angle_spec.get("title") or "").strip()
    focus = str(angle_spec.get("focus") or "").strip()
    if not title:
        return CoherenceVerdict(score=-1, reasons=[], available=False)

    story = _story_text(blocks)
    if not story:
        # Empty story is trivially off-angle, but the verifier upstream will
        # already have flagged that. Return unavailable to avoid double-flagging.
        return CoherenceVerdict(score=-1, reasons=[], available=False)

    llm = get_llm_optional()
    if llm is None:
        return CoherenceVerdict(score=-1, reasons=[], available=False)

    descriptor_line = (
        f"\nFOCUS ENTITIES (the only subjects the story should be about): "
        f"{', '.join(focus_descriptors)}"
        if focus_descriptors else ""
    )

    prompt = (
        "You are an editorial coherence judge. You are NOT a fact checker. "
        "Your only job: rate how tightly a story serves its assigned angle.\n\n"
        f"ANGLE TITLE: {title}\n"
        f"ANGLE FOCUS: {focus}{descriptor_line}\n\n"
        "STORY DRAFT:\n"
        f"\"\"\"\n{story}\n\"\"\"\n\n"
        "Score the story 0–10 on how well its narrative stays on this specific angle:\n"
        "  10 = every paragraph advances the angle; no drift.\n"
        "   7 = mostly on-angle, with one or two tangents.\n"
        "   5 = partially on-angle but introduces unrelated drivers/storylines.\n"
        "   3 = the story uses the angle as a starting point but is mostly about other things.\n"
        "   0 = the story ignores the angle.\n\n"
        "Output ONLY a JSON object with EXACTLY these fields:\n"
        '  {"score": <int 0-10>, "reasons": ["<short reason 1>", "<short reason 2>", ...]}\n'
        "Keep each reason under 120 chars. 1-3 reasons. No prose, no code fences."
    )

    try:
        # CrewAI LLM.call() — synchronous string completion.
        raw = llm.call(prompt)
    except Exception as e:
        logger.warning("angle-coherence judge LLM call failed: %s", e)
        return CoherenceVerdict(score=-1, reasons=[], available=False)

    obj = _extract_json_object(str(raw)) or {}
    score = obj.get("score")
    reasons = obj.get("reasons")

    # Defensive parsing — LLMs occasionally return "score": "7" or "score": 7.5.
    if isinstance(score, str):
        m = re.match(r"\s*(-?\d+)", score)
        score = int(m.group(1)) if m else None
    if isinstance(score, float):
        score = int(score)
    if not isinstance(score, int):
        return CoherenceVerdict(score=-1, reasons=[], available=False)
    score = max(0, min(10, score))

    if not isinstance(reasons, list):
        reasons = []
    reasons = [str(r).strip()[:200] for r in reasons if str(r).strip()][:5]

    return CoherenceVerdict(score=score, reasons=reasons, available=True)
