"""Frame hierarchy and object assignment."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any


@dataclass
class FrameInfo:
    id: str
    label_text: str
    slug: str
    bounds: dict[str, float] | None
    child_count: int = 0


def slugify(label: str, fallback: str = "frame") -> str:
    text = unicodedata.normalize("NFKD", label or fallback)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"[-\s]+", "-", text.strip().lower())
    return text[:80] or fallback


def get_bounds(obj: dict[str, Any]) -> dict[str, float] | None:
    bounds = obj.get("bounds") or obj.get("position")
    if not isinstance(bounds, dict):
        return None
    x = bounds.get("x")
    y = bounds.get("y")
    w = bounds.get("width")
    h = bounds.get("height")
    if x is None or y is None:
        return None
    if w is None:
        w = obj.get("width", 0)
    if h is None:
        h = obj.get("height", 0)
    try:
        return {
            "x": float(x),
            "y": float(y),
            "width": float(w or 0),
            "height": float(h or 0),
        }
    except (TypeError, ValueError):
        return None


def point_in_rect(px: float, py: float, rect: dict[str, float]) -> bool:
    return (
        rect["x"] <= px <= rect["x"] + rect["width"]
        and rect["y"] <= py <= rect["y"] + rect["height"]
    )


def object_anchor(obj: dict[str, Any]) -> tuple[float, float] | None:
    bounds = get_bounds(obj)
    if not bounds:
        return None
    return (
        bounds["x"] + bounds["width"] / 2,
        bounds["y"] + bounds["height"] / 2,
    )


def build_frames(objects: list[dict[str, Any]]) -> dict[str, FrameInfo]:
    frames: dict[str, FrameInfo] = {}
    for obj in objects:
        if obj.get("type") != "frame":
            continue
        fid = obj.get("id")
        if not fid:
            continue
        label = (obj.get("labelText") or obj.get("name") or fid).strip()
        frames[fid] = FrameInfo(
            id=fid,
            label_text=label,
            slug=slugify(label, fid[:8]),
            bounds=get_bounds(obj),
        )
    return frames


def assign_object_to_frame(
    obj: dict[str, Any],
    frames: dict[str, FrameInfo],
) -> str | None:
    parent_id = obj.get("parentId")
    if parent_id and parent_id in frames:
        return parent_id

    anchor = object_anchor(obj)
    if not anchor:
        return None

    px, py = anchor
    matches: list[tuple[float, FrameInfo]] = []
    for frame in frames.values():
        if frame.bounds and point_in_rect(px, py, frame.bounds):
            area = frame.bounds["width"] * frame.bounds["height"]
            matches.append((area, frame))

    if not matches:
        return None

    matches.sort(key=lambda item: item[0])
    return matches[0][1].id


def find_frame_by_query(
    frames: dict[str, FrameInfo],
    query: str,
) -> FrameInfo | None:
    q = query.strip().lower()
    if not q:
        return None

    for frame in frames.values():
        if frame.id.lower() == q:
            return frame

    exact = [f for f in frames.values() if f.label_text.lower() == q]
    if len(exact) == 1:
        return exact[0]

    partial = [f for f in frames.values() if q in f.label_text.lower()]
    if len(partial) == 1:
        return partial[0]
    if partial:
        partial.sort(key=lambda f: len(f.label_text))
        return partial[0]

    return None


def ensure_unique_slugs(frames: dict[str, FrameInfo]) -> None:
    used: dict[str, int] = {}
    for frame in frames.values():
        base = frame.slug
        if base not in used:
            used[base] = 1
            continue
        used[base] += 1
        frame.slug = f"{base}-{used[base]}"
