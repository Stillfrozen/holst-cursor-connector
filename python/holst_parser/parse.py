"""Core .holst parsing and markdown export."""

from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from holst_parser.frames import (
    FrameInfo,
    assign_object_to_frame,
    build_frames,
    ensure_unique_slugs,
    find_frame_by_query,
    slugify,
)
from holst_parser.slate import extract_plain_text, extract_text_from_json_state

TEXT_TYPES = {
    "sticker",
    "simple-text",
    "shape",
    "text",
    "link",
    "stamp",
    "card",
    "task-card",
}

SKIP_TYPES = {"frame", "group", "arrow"}


@dataclass
class ParsedObject:
    id: str
    type: str
    frame_id: str | None
    z_index: float
    text: str
    plain_text: str
    label_text: str | None
    asset_path: str | None = None
    raw: dict[str, Any] = field(repr=False, default_factory=dict)


@dataclass
class ParseResult:
    board_id: str
    board_name: str
    backup_path: Path
    output_dir: Path
    index_path: Path
    summary_path: Path
    frames: list[FrameInfo]
    object_stats: dict[str, int]
    parsed_at: str


def _object_text(obj: dict[str, Any]) -> tuple[str, str, str | None]:
    label = obj.get("labelText")
    if isinstance(label, str) and label.strip():
        return label.strip(), label.strip(), label.strip()

    json_state = obj.get("jsonState")
    md = extract_text_from_json_state(json_state)
    plain = extract_plain_text(json_state) if json_state else ""

    if not md and isinstance(obj.get("text"), str):
        md = obj["text"]
        plain = obj["text"]

    if not md and isinstance(obj.get("url"), str):
        md = obj["url"]
        plain = obj["url"]

    return md, plain, label if isinstance(label, str) else None


def _object_asset(obj: dict[str, Any], assets_dir: Path) -> str | None:
    obj_type = obj.get("type")
    if obj_type == "image":
        name = obj.get("name")
        if isinstance(name, str) and (assets_dir / name).exists():
            return f"assets/{name}"
    if obj_type == "file":
        file_name = obj.get("fileName")
        if isinstance(file_name, str) and (assets_dir / file_name).exists():
            return f"assets/{file_name}"
    return None


def _z_index(obj: dict[str, Any]) -> float:
    value = obj.get("zIndex", 0)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def load_board_data(backup_path: Path, work_dir: Path) -> dict[str, Any]:
    work_dir.mkdir(parents=True, exist_ok=True)
    assets_dir = work_dir / "assets"
    assets_dir.mkdir(exist_ok=True)

    with zipfile.ZipFile(backup_path) as archive:
        if "data.json" not in archive.namelist():
            raise ValueError(f"No data.json in {backup_path}")
        data = json.loads(archive.read("data.json"))
        for name in archive.namelist():
            if name == "data.json" or name.endswith("/"):
                continue
            target = assets_dir / Path(name).name
            if not target.exists():
                target.write_bytes(archive.read(name))

    (work_dir / "data.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return data


def parse_board_data(
    data: dict[str, Any],
    *,
    board_id: str,
    backup_path: Path,
    output_dir: Path,
) -> ParseResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = output_dir / "frames"
    frames_dir.mkdir(exist_ok=True)
    assets_dir = output_dir / "assets"

    objects: list[dict[str, Any]] = data.get("objects") or []
    board_name = str(data.get("boardName") or board_id)

    frames = build_frames(objects)
    parsed_objects: list[ParsedObject] = []
    stats: dict[str, int] = {}
    by_frame: dict[str, list[ParsedObject]] = {fid: [] for fid in frames}
    unassigned: list[ParsedObject] = []

    for obj in objects:
        obj_type = str(obj.get("type") or "unknown")
        stats[obj_type] = stats.get(obj_type, 0) + 1
        if obj_type in SKIP_TYPES:
            continue

        obj_id = str(obj.get("id") or "")
        text, plain, label = _object_text(obj)
        asset = _object_asset(obj, assets_dir)
        frame_id = assign_object_to_frame(obj, frames)

        parsed = ParsedObject(
            id=obj_id,
            type=obj_type,
            frame_id=frame_id,
            z_index=_z_index(obj),
            text=text,
            plain_text=plain,
            label_text=label,
            asset_path=asset,
            raw=obj,
        )
        parsed_objects.append(parsed)

        if frame_id:
            by_frame[frame_id].append(parsed)
        else:
            unassigned.append(parsed)

    for frame in frames.values():
        frame.child_count = len(by_frame.get(frame.id, []))

    ensure_unique_slugs(frames)

    frame_rows = []
    for frame in sorted(frames.values(), key=lambda f: (-f.child_count, f.label_text)):
        frame_rows.append(
            {
                "id": frame.id,
                "labelText": frame.label_text,
                "slug": frame.slug,
                "childCount": frame.child_count,
                "markdownPath": f"frames/{frame.slug}.md",
            }
        )
        _write_frame_markdown(frames_dir / f"{frame.slug}.md", frame, by_frame.get(frame.id, []))

    if unassigned:
        orphan = FrameInfo(
            id="__unassigned__",
            label_text="Unassigned",
            slug="unassigned",
            bounds=None,
            child_count=len(unassigned),
        )
        _write_frame_markdown(frames_dir / "unassigned.md", orphan, unassigned)
        frame_rows.append(
            {
                "id": orphan.id,
                "labelText": orphan.label_text,
                "slug": orphan.slug,
                "childCount": orphan.child_count,
                "markdownPath": "frames/unassigned.md",
            }
        )

    parsed_at = datetime.now(timezone.utc).isoformat()
    index = {
        "boardId": board_id,
        "boardName": board_name,
        "backupPath": str(backup_path),
        "parsedAt": parsed_at,
        "objectStats": stats,
        "frames": frame_rows,
        "unassignedCount": len(unassigned),
    }

    index_path = output_dir / "index.json"
    summary_path = output_dir / "board-summary.md"
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_path.write_text(_render_summary(board_name, board_id, frame_rows, stats, parsed_at), encoding="utf-8")

    return ParseResult(
        board_id=board_id,
        board_name=board_name,
        backup_path=backup_path,
        output_dir=output_dir,
        index_path=index_path,
        summary_path=summary_path,
        frames=sorted(frames.values(), key=lambda f: f.label_text.lower()),
        object_stats=stats,
        parsed_at=parsed_at,
    )


def _write_frame_markdown(path: Path, frame: FrameInfo, items: list[ParsedObject]) -> None:
    lines = [
        f"# {frame.label_text}",
        "",
        f"- frameId: `{frame.id}`",
        f"- objects: {len(items)}",
        "",
    ]

    for item in sorted(items, key=lambda o: (o.z_index, o.id)):
        header = item.plain_text.split("\n", 1)[0][:120] if item.plain_text else item.type
        lines.append(f"## {item.type}: {header or item.id}")
        lines.append("")
        if item.text:
            lines.append(item.text)
            lines.append("")
        if item.asset_path:
            lines.append(f"![asset]({item.asset_path})")
            lines.append("")
        lines.append(f"<!-- objectId: {item.id} -->")
        lines.append("")

    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _render_summary(
    board_name: str,
    board_id: str,
    frames: list[dict[str, Any]],
    stats: dict[str, int],
    parsed_at: str,
) -> str:
    lines = [
        f"# {board_name}",
        "",
        f"- boardId: `{board_id}`",
        f"- parsedAt: {parsed_at}",
        "",
        "## Frames",
        "",
    ]
    for frame in frames:
        if frame["slug"] == "unassigned":
            continue
        lines.append(
            f"- **{frame['labelText']}** ({frame['childCount']} objects) — `{frame['markdownPath']}`"
        )
    lines.extend(["", "## Object stats", ""])
    for obj_type, count in sorted(stats.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- {obj_type}: {count}")
    return "\n".join(lines) + "\n"


def parse_holst_file(
    backup_path: Path,
    output_dir: Path,
    *,
    board_id: str | None = None,
) -> ParseResult:
    backup_path = backup_path.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()

    resolved_board_id = board_id or slugify(backup_path.stem, "board")
    work_dir = output_dir
    if (output_dir / "parsed").exists() or output_dir.name != "parsed":
        work_dir = output_dir if output_dir.name == "parsed" else output_dir / "parsed"

    data = load_board_data(backup_path, work_dir)
    return parse_board_data(
        data,
        board_id=resolved_board_id,
        backup_path=backup_path,
        output_dir=work_dir,
    )


def read_index(parsed_dir: Path) -> dict[str, Any]:
    index_path = parsed_dir / "index.json"
    if not index_path.exists():
        raise FileNotFoundError(f"Missing index.json in {parsed_dir}")
    return json.loads(index_path.read_text(encoding="utf-8"))


def get_frame_markdown(parsed_dir: Path, frame_query: str) -> tuple[dict[str, Any], str]:
    index = read_index(parsed_dir)
    frames = index.get("frames") or []
    frame_map = {
        row["id"]: row for row in frames if isinstance(row, dict) and row.get("id")
    }
    label_map = {
        str(row.get("labelText", "")).lower(): row
        for row in frames
        if isinstance(row, dict)
    }

    query = frame_query.strip()
    q_lower = query.lower()

    matched: dict[str, Any] | None = None
    if query in frame_map:
        matched = frame_map[query]
    elif q_lower in label_map:
        matched = label_map[q_lower]
    else:
        partial = [row for row in frames if q_lower in str(row.get("labelText", "")).lower()]
        if partial:
            partial.sort(key=lambda row: len(str(row.get("labelText", ""))))
            matched = partial[0]

    if not matched:
        raise KeyError(f"Frame not found: {frame_query}")

    md_path = parsed_dir / str(matched.get("markdownPath", ""))
    if not md_path.exists():
        raise FileNotFoundError(f"Missing markdown for frame {frame_query}: {md_path}")

    return matched, md_path.read_text(encoding="utf-8")
