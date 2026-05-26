"""Extract plain / markdown text from Holst Slate jsonState."""

from __future__ import annotations

import json
import re
from typing import Any


def _parse_children(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else [parsed]
    return []


def _node_to_markdown(node: Any) -> str:
    if not isinstance(node, dict):
        return ""

    if "text" in node and isinstance(node["text"], str):
        text = node["text"]
        if node.get("bold"):
            text = f"**{text}**"
        if node.get("italic"):
            text = f"*{text}*"
        if node.get("code"):
            text = f"`{text}`"
        if node.get("underline"):
            text = f"_{text}_"
        return text

    children = node.get("children")
    if children is None:
        return ""

    inner = "".join(_node_to_markdown(child) for child in _parse_children(children))
    node_type = node.get("type", "")

    if node_type in ("paragraph", "initial", "wrapper"):
        return inner
    if node_type == "heading":
        level = min(int(node.get("level") or 1), 6)
        return f"{'#' * level} {inner.strip()}\n\n"
    if node_type in ("bulleted-list", "numbered-list"):
        return inner
    if node_type in ("bulleted-list-item", "numbered-list-item", "list-item", "ol-list-item"):
        return f"- {inner.strip()}\n"
    if node_type == "link":
        url = node.get("url") or node.get("href") or ""
        label = inner.strip() or url
        return f"[{label}]({url})" if url else label

    return inner


def extract_text_from_json_state(json_state: Any) -> str:
    """Return markdown-ish text from a Holst object's jsonState."""
    if not json_state:
        return ""

    if isinstance(json_state, str):
        try:
            json_state = json.loads(json_state)
        except json.JSONDecodeError:
            return json_state.strip()

    if not isinstance(json_state, dict):
        return ""

    children = _parse_children(json_state.get("children"))
    parts: list[str] = []
    for child in children:
        chunk = _node_to_markdown(child).strip()
        if chunk:
            parts.append(chunk)

    text = "\n\n".join(parts)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_plain_text(json_state: Any) -> str:
    """Strip markdown markers for search / matching."""
    md = extract_text_from_json_state(json_state)
    md = re.sub(r"\*\*(.+?)\*\*", r"\1", md)
    md = re.sub(r"\*(.+?)\*", r"\1", md)
    md = re.sub(r"`(.+?)`", r"\1", md)
    md = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", md)
    return md.strip()
