"""Robust JSON extraction from LLM output.

LLMs frequently wrap JSON in prose, markdown fences, or emit several blocks.
A greedy ``re.search(r'\\{[\\s\\S]*\\}')`` grabs the outermost braces and breaks on
any of those cases. These helpers instead scan for the first *balanced* JSON
value (object or array), respecting strings and escapes, and try progressively
wider candidates until one parses.
"""

from __future__ import annotations

import json
import re

_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def _iter_balanced(text: str, open_ch: str, close_ch: str):
    """Yield substrings that are balanced ``open_ch``/``close_ch`` spans,
    ignoring braces inside JSON string literals."""
    depth = 0
    start = -1
    in_str = False
    escape = False
    for i, ch in enumerate(text):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == open_ch:
            if depth == 0:
                start = i
            depth += 1
        elif ch == close_ch and depth > 0:
            depth -= 1
            if depth == 0 and start != -1:
                yield text[start : i + 1]
                start = -1


def _candidates(text: str, open_ch: str, close_ch: str):
    # Prefer fenced blocks first (the model was usually asked for JSON only).
    for m in _FENCE_RE.finditer(text):
        yield m.group(1).strip()
    yield from _iter_balanced(text, open_ch, close_ch)


def extract_json_object(text: str) -> dict | None:
    """Return the first balanced JSON object that parses to a dict, else None."""
    if not text:
        return None
    for cand in _candidates(text, "{", "}"):
        try:
            obj = json.loads(cand)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(obj, dict):
            return obj
    return None


def extract_json_array(text: str) -> list | None:
    """Return the first balanced JSON array that parses to a list, else None.

    Falls back to a single object wrapped in a list when only an object is found
    (some models return one item instead of an array)."""
    if not text:
        return None
    for cand in _candidates(text, "[", "]"):
        try:
            arr = json.loads(cand)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(arr, list):
            return arr
    obj = extract_json_object(text)
    if obj is not None:
        return [obj]
    return None
