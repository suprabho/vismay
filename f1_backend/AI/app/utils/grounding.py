"""
Grounding helpers for the CrewAI story pipeline.

Two responsibilities:

  • lap_window_from_angle  — derive the inclusive (lo, hi) lap range an angle is
                             about, so scoped tools can pre-filter the data the
                             analyst sees.
  • verify_claims_against_slice — programmatic post-crew check that every
                             numeric claim in the story (lap times, lap
                             references) is consistent with the actual data
                             slice the analyst worked from.

The verifier is intentionally narrow: it only fails CLEAR mismatches (lap
number outside the slice, lap-time delta > 0.10s). Anything ambiguous is
ignored — the goal is to catch hallucinations, not to nitpick rounding.
"""

from __future__ import annotations

import re
from typing import Iterable

# Pad a couple of laps either side of the signal range so the analyst still
# sees the "lead-in" context for a stint/sector story.
_LAP_PAD = 2

# Match "1:23.456" or "1:23.4" or "83.456".
_TIME_RE = re.compile(r"\b(?:(\d{1,2}):)?(\d{1,3})\.(\d{1,3})\b")
# Match "lap 23", "lap 7", etc. (case-insensitive).
_LAP_RE = re.compile(r"\blap\s+(\d{1,3})\b", re.IGNORECASE)

# Tolerance when comparing a cited lap time against the actual lap time.
_LAP_TIME_TOL_SEC = 0.10


# ── resolve_angle_entities ────────────────────────────────────────────────────

# Match "#NN" car-number references.
_HASH_NUM_RE = re.compile(r"#\s*(\d{1,3})\b")

# First names that are too generic to safely match alone (would risk false
# positives if multiple drivers share a first name across seasons).
_AMBIGUOUS_FIRST_NAMES = {"alex", "carlos", "lewis", "george", "max", "lando",
                          "oscar", "charles", "fernando", "valtteri", "kevin"}


def resolve_angle_entities(
    angle_spec: dict | None,
    roster: list[dict] | None,
) -> dict:
    """Parse an angle's title + focus + rationale for explicit driver/team mentions.

    The Angle Scout discovers angles per-scope, but the angle's TITLE/FOCUS can
    cite specific drivers (e.g. "Antonelli vs. Russell" inside a team-scope
    angle, or "VER vs HAM" inside a driver-scope angle). Returning the resolved
    entities lets the story crew:
      1. Pass them as extra_driver_numbers to the scoped tools so the data
         slice actually contains every cited driver.
      2. Inject an explicit FOCUS list into the analyst + writer prompts so
         the narrative stays on the angle's subjects.

    Matches against, in order of confidence: '#NN' car numbers, abbreviations
    (3-letter codes), broadcastName ('M VERSTAPPEN'), lastName, fullName.
    First name alone is intentionally skipped — too ambiguous.

    Returns:
        {
          'driverNumbers': [int, ...],   # in match order, deduped
          'teamIds':       [str, ...],
          'descriptors':   ['VER #1', 'Mercedes', ...]  # human-friendly
        }
    """
    empty = {"driverNumbers": [], "teamIds": [], "descriptors": []}
    if not isinstance(angle_spec, dict) or not roster:
        return empty

    text = " ".join(str(angle_spec.get(k) or "") for k in ("title", "focus", "rationale"))
    if not text.strip():
        return empty
    text_lower = text.lower()

    driver_nums: list[int] = []
    descriptors: list[str] = []
    seen_dn: set[int] = set()

    def _add_driver(dn: int, abbr: str = "") -> None:
        if dn in seen_dn:
            return
        seen_dn.add(dn)
        driver_nums.append(dn)
        descriptors.append(f"{abbr} #{dn}".strip() if abbr else f"#{dn}")

    # 1) '#NN' car numbers (highest confidence).
    roster_by_num = {d.get("driverNumber"): d for d in roster if isinstance(d.get("driverNumber"), int)}
    for m in _HASH_NUM_RE.finditer(text):
        try:
            n = int(m.group(1))
        except ValueError:
            continue
        d = roster_by_num.get(n)
        if d:
            _add_driver(n, d.get("abbreviation") or "")

    # 2) Driver name fields (lastName / abbreviation / broadcastName / fullName).
    for d in roster:
        dn = d.get("driverNumber")
        if not isinstance(dn, int) or dn in seen_dn:
            continue
        for field in ("lastName", "abbreviation", "broadcastName", "fullName"):
            cand = (d.get(field) or "").strip()
            if not cand or cand.lower() in _AMBIGUOUS_FIRST_NAMES:
                continue
            # Word-boundary case-insensitive match.
            if re.search(r"\b" + re.escape(cand) + r"\b", text, re.IGNORECASE):
                _add_driver(dn, d.get("abbreviation") or "")
                break

    # 3) Team names (multi-word, so case-insensitive substring is safer).
    team_ids: list[str] = []
    seen_tids: set[str] = set()
    for d in roster:
        tid  = (d.get("teamId")   or "").strip()
        tname = (d.get("teamName") or "").strip()
        if not tid or not tname or tid in seen_tids:
            continue
        if tname.lower() in text_lower:
            team_ids.append(tid)
            seen_tids.add(tid)
            descriptors.append(tname)

    return {
        "driverNumbers": driver_nums,
        "teamIds":       team_ids,
        "descriptors":   descriptors,
    }


# ── lap_window_from_angle ─────────────────────────────────────────────────────

# Patterns for extracting lap references from angle text when signals lack them.
# "laps 30-45", "laps 30–45", "laps 30 to 45"
_LAP_RANGE_RE = re.compile(
    r"\blaps?\s+(\d{1,3})\s*[-–to]+\s*(\d{1,3})\b", re.IGNORECASE
)
# "lap 12", "lap 5"
_LAP_SINGLE_RE = re.compile(r"\blap\s+(\d{1,3})\b", re.IGNORECASE)
# "final stint", "last stint", "opening stint", "first stint"
_STINT_HINT_RE = re.compile(
    r"\b(final|last|closing)\s+stint\b", re.IGNORECASE
)
_OPENING_STINT_RE = re.compile(
    r"\b(opening|first|early)\s+stint\b", re.IGNORECASE
)


def _extract_laps_from_text(text: str) -> list[int]:
    """Parse explicit lap numbers from free-text angle title/focus/rationale."""
    laps: list[int] = []
    for m in _LAP_RANGE_RE.finditer(text):
        try:
            laps.extend([int(m.group(1)), int(m.group(2))])
        except ValueError:
            pass
    for m in _LAP_SINGLE_RE.finditer(text):
        try:
            laps.append(int(m.group(1)))
        except ValueError:
            pass
    return [l for l in laps if l > 0]


def lap_window_from_angle(
    angle_spec: dict | None,
    default: tuple[int, int] | None = None,
    pad: int = _LAP_PAD,
) -> tuple[int, int] | None:
    """Derive (lo, hi) inclusive from an angle.

    Resolution order (highest confidence first):
      1. `angle_spec.lapWindow = {start, end}` — emitted directly by the Angle
         Scout. This is the authoritative source: the scout knows the story it
         is proposing better than any post-hoc heuristic. No padding applied —
         the scout already chose its bounds.
      2. `signals[].lap` / `startLap` / `endLap` — laps tagged on the supporting
         signals the scout cited. Padded by ±`pad` so the analyst sees lead-in.
      3. Free-text lap references in title/focus/rationale (e.g. "laps 30-45",
         "lap 12"). Padded by ±`pad`.
      4. `default` (typically `None`) — full session, last resort.
    """
    if not isinstance(angle_spec, dict):
        return default

    # 1) Scout-supplied window (preferred — no padding, scout chose it).
    win = angle_spec.get("lapWindow")
    if isinstance(win, dict):
        start, end = win.get("start"), win.get("end")
        if isinstance(start, int) and isinstance(end, int) and start > 0 and end >= start:
            return (start, end)
    elif isinstance(win, (list, tuple)) and len(win) == 2:
        start, end = win
        if isinstance(start, int) and isinstance(end, int) and start > 0 and end >= start:
            return (start, end)

    # 2) Signal-level lap data.
    signals = angle_spec.get("signals")
    laps: list[int] = []
    if isinstance(signals, list):
        for s in signals:
            if not isinstance(s, dict):
                continue
            for key in ("lap", "startLap", "endLap"):
                v = s.get(key)
                if isinstance(v, int) and v > 0:
                    laps.append(v)

    # 3) Fallback: parse lap references from the angle's free text.
    if not laps:
        angle_text = " ".join(
            str(angle_spec.get(k) or "")
            for k in ("title", "focus", "rationale")
        )
        laps = _extract_laps_from_text(angle_text)

    if not laps:
        return default

    lo = max(1, min(laps) - pad)
    hi = max(laps) + pad
    return (lo, hi)


# ── angle-text invites comparison? ────────────────────────────────────────────

# Words that indicate the angle wants a teammate comparison. "teammate" is the
# obvious one; "intra-team", "garage-mate", and "stablemate" all surface in F1
# editorial.
_TEAMMATE_INVITE_RE = re.compile(
    r"\b(team[\s-]?mate|teammate|intra[\s-]?team|garage[\s-]?mate|stable[\s-]?mate|"
    r"same[\s-]?car|sister[\s-]?car)\b",
    re.IGNORECASE,
)
# Words that indicate the angle wants a leader / podium / front-of-grid baseline.
_LEADER_INVITE_RE = re.compile(
    r"\b(leader|podium|front[\s-]?runner|race[\s-]?winner|pole[\s-]?sitter|"
    r"top[\s-]?(3|three|five|5)|p1\b|midfield[\s-]?gap)\b",
    re.IGNORECASE,
)
# "vs", "versus", "against", "head-to-head" — strong head-to-head signal.
_HEAD_TO_HEAD_RE = re.compile(
    r"\b(vs\.?|versus|against|head[\s-]?to[\s-]?head|duel|battle|fight)\b",
    re.IGNORECASE,
)


def _angle_text(angle_spec: dict | None) -> str:
    if not isinstance(angle_spec, dict):
        return ""
    return " ".join(str(angle_spec.get(k) or "") for k in ("title", "focus", "rationale"))


def angle_invites_teammate_comparison(angle_spec: dict | None) -> bool:
    """True iff the angle text explicitly invites a teammate comparison."""
    return bool(_TEAMMATE_INVITE_RE.search(_angle_text(angle_spec)))


def angle_invites_leader_comparison(angle_spec: dict | None) -> bool:
    """True iff the angle text explicitly invites a leader / podium baseline."""
    return bool(_LEADER_INVITE_RE.search(_angle_text(angle_spec)))


def angle_is_head_to_head(angle_spec: dict | None) -> bool:
    """True iff the angle title/focus reads like a head-to-head matchup."""
    return bool(_HEAD_TO_HEAD_RE.search(_angle_text(angle_spec)))


# ── filter_brief_for_angle ────────────────────────────────────────────────────

def filter_brief_for_angle(
    brief: str | None,
    focus_descriptors: list[str],
    max_chars: int = 1200,
) -> str:
    """Filter the session-wide analyst brief to only keep sentences that
    mention at least one of the angle's focus entities (driver names, team
    names, car numbers). This prevents the LLM from latching onto interesting
    but unrelated storylines from the broader session brief.

    Returns an empty string if no relevant sentences are found or if no
    focus descriptors are provided.
    """
    if not brief or not focus_descriptors:
        return ""

    # Build case-insensitive patterns from the descriptors. Each descriptor
    # looks like "VER #1" or "Mercedes" — split into individual tokens so
    # "VER" and "#1" each independently match.
    tokens: list[str] = []
    for desc in focus_descriptors:
        for part in desc.split():
            part = part.strip()
            if len(part) >= 2:  # skip single-char noise
                tokens.append(re.escape(part))
    if not tokens:
        return ""

    pattern = re.compile(r"\b(?:" + "|".join(tokens) + r")\b", re.IGNORECASE)

    # Split brief into sentences (rough split on '. ' / newlines).
    sentences = re.split(r"(?<=[.!?])\s+|\n+", brief)
    relevant: list[str] = []
    total = 0
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if pattern.search(s):
            if total + len(s) > max_chars:
                break
            relevant.append(s)
            total += len(s)

    return " ".join(relevant)


# ── verifier ──────────────────────────────────────────────────────────────────

def _parse_time(match: re.Match) -> float | None:
    """Parse the time-regex match into seconds. Returns None on garbage."""
    mins_s, secs_s, frac_s = match.group(1), match.group(2), match.group(3)
    try:
        secs = int(secs_s) + float(f"0.{frac_s}")
        if mins_s:
            secs += int(mins_s) * 60
        # Sanity: ignore values that obviously aren't lap times.
        if secs <= 5 or secs > 600:
            return None
        return secs
    except (TypeError, ValueError):
        return None


def _iter_block_texts(blocks: list[dict]) -> Iterable[tuple[int, str]]:
    for i, b in enumerate(blocks or []):
        if not isinstance(b, dict):
            continue
        text = b.get("text")
        if isinstance(text, str) and text.strip():
            yield i, text


def verify_claims_against_slice(
    blocks: list[dict],
    slice_doc: dict | None,
    *,
    lap_window: tuple[int, int] | None = None,
    focal_driver_number: int | None = None,
) -> list[str]:
    """Return a list of human-readable mismatch warnings.

    Checks:
      1. Every "lap N" reference falls inside `lap_window` (when provided).
      2. Every "lap N" reference is a lap that actually appears in `slice_doc`
         for the focal driver (and maybe teammate/leader — we accept any
         driver in the slice).
      3. For sentences that contain BOTH a lap N and a "M:SS.sss" time near
         each other, the cited time is within `_LAP_TIME_TOL_SEC` of an
         actual lap time for that lap (any driver in the slice).
    """
    if not blocks:
        return []

    slice_doc = slice_doc or {}
    laps = slice_doc.get("laps") or slice_doc.get("processedLaps") or []
    # Build {lap -> [lapTimeSec, ...]} across all drivers in the slice.
    lap_times: dict[int, list[float]] = {}
    for l in laps:
        if not isinstance(l, dict):
            continue
        ln = l.get("lap")
        lt = l.get("lapTimeSec")
        if isinstance(ln, int) and isinstance(lt, (int, float)) and lt > 0:
            lap_times.setdefault(int(ln), []).append(float(lt))

    valid_laps = set(lap_times.keys())
    warnings: list[str] = []

    for idx, text in _iter_block_texts(blocks):
        # Collect lap citations once per block.
        lap_matches = list(_LAP_RE.finditer(text))
        time_matches = list(_TIME_RE.finditer(text))

        for lm in lap_matches:
            try:
                lap_n = int(lm.group(1))
            except (TypeError, ValueError):
                continue

            if lap_window is not None:
                lo, hi = lap_window
                if not (lo <= lap_n <= hi):
                    warnings.append(
                        f"block[{idx}]: lap {lap_n} cited outside angle window [{lo},{hi}]"
                    )
                    continue

            if valid_laps and lap_n not in valid_laps:
                warnings.append(
                    f"block[{idx}]: lap {lap_n} not present in materialised slice"
                )
                continue

            # If a time appears near this lap reference, sanity-check it.
            # "Near" = within ~80 chars on either side.
            lap_pos = lm.start()
            near_times: list[float] = []
            for tm in time_matches:
                if abs(tm.start() - lap_pos) > 80:
                    continue
                t_secs = _parse_time(tm)
                if t_secs is not None:
                    near_times.append(t_secs)

            if not near_times:
                continue

            actuals = lap_times.get(lap_n, [])
            if not actuals:
                continue
            for cited in near_times:
                # Accept the closest actual lap time as the intended target.
                closest = min(actuals, key=lambda t: abs(t - cited))
                delta = abs(cited - closest)
                if delta > _LAP_TIME_TOL_SEC:
                    warnings.append(
                        f"block[{idx}]: cited {cited:.3f}s on lap {lap_n} "
                        f"differs from actual {closest:.3f}s by {delta:.3f}s"
                    )

    # De-dupe while preserving order.
    seen: set[str] = set()
    deduped: list[str] = []
    for w in warnings:
        if w in seen:
            continue
        seen.add(w)
        deduped.append(w)
    return deduped
