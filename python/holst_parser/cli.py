"""CLI for Holst backup parsing."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from holst_parser.parse import get_frame_markdown, parse_holst_file, read_index


def _cmd_parse(args: argparse.Namespace) -> int:
    result = parse_holst_file(
        Path(args.backup),
        Path(args.out),
        board_id=args.board_id,
    )
    payload = {
        "boardId": result.board_id,
        "boardName": result.board_name,
        "outputDir": str(result.output_dir),
        "indexPath": str(result.index_path),
        "summaryPath": str(result.summary_path),
        "frameCount": len(result.frames),
        "parsedAt": result.parsed_at,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def _cmd_list_frames(args: argparse.Namespace) -> int:
    index = read_index(Path(args.parsed_dir))
    frames = index.get("frames") or []
    if args.json:
        print(json.dumps(frames, ensure_ascii=False, indent=2))
        return 0
    for frame in frames:
        print(
            f"{frame.get('labelText')}\t{frame.get('childCount')}\t{frame.get('slug')}\t{frame.get('id')}"
        )
    return 0


def _cmd_get_frame(args: argparse.Namespace) -> int:
    meta, markdown = get_frame_markdown(Path(args.parsed_dir), args.name)
    if args.json:
        print(
            json.dumps(
                {
                    "frame": meta,
                    "markdown": markdown,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    if args.markdown_only:
        print(markdown, end="")
        return 0
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print("---")
    print(markdown, end="")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Parse Holst .holst backup files")
    sub = parser.add_subparsers(dest="command", required=True)

    parse_cmd = sub.add_parser("parse", help="Parse a .holst backup into markdown")
    parse_cmd.add_argument("backup", help="Path to .holst file")
    parse_cmd.add_argument("--out", required=True, help="Output directory")
    parse_cmd.add_argument("--board-id", help="Override board id used in index")
    parse_cmd.set_defaults(func=_cmd_parse)

    list_cmd = sub.add_parser("list-frames", help="List frames from parsed index")
    list_cmd.add_argument("parsed_dir", help="Parsed output directory")
    list_cmd.add_argument("--json", action="store_true")
    list_cmd.set_defaults(func=_cmd_list_frames)

    get_cmd = sub.add_parser("get-frame", help="Get frame markdown by name or id")
    get_cmd.add_argument("parsed_dir", help="Parsed output directory")
    get_cmd.add_argument("--name", required=True, help="Frame label, slug, or id")
    get_cmd.add_argument("--json", action="store_true")
    get_cmd.add_argument("--markdown-only", action="store_true")
    get_cmd.set_defaults(func=_cmd_get_frame)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
