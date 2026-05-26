#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP="${HOLST_TEST_BACKUP:-}"
if [[ -z "$BACKUP" ]]; then
  echo "Set HOLST_TEST_BACKUP to a local .holst file path."
  exit 1
fi
BOARD_ID="${HOLST_TEST_BOARD_ID:-00000000-0000-4000-8000-000000000001}"
OUT="${TMPDIR:-/tmp}/holst-e2e-$$"

if [[ ! -f "$BACKUP" ]]; then
  echo "Missing test backup: $BACKUP"
  echo "Set HOLST_TEST_BACKUP to a .holst file path."
  exit 1
fi

export HOLST_PARSER_ROOT="$ROOT/python"
export PYTHONPATH="$ROOT/python"

echo "== parse =="
PARSE_JSON="$(python3 -m holst_parser.cli parse "$BACKUP" --out "$OUT" --board-id "$BOARD_ID")"
echo "$PARSE_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['frameCount']>=1"

echo "== list frames =="
python3 -m holst_parser.cli list-frames "$OUT/parsed" --json | python3 -c "import json,sys; frames=json.load(sys.stdin); assert len(frames)>=1; print('frames:', len(frames))"

echo "== get frame Vitrina =="
MD="$(python3 -m holst_parser.cli get-frame "$OUT/parsed" --name 'Витрина' --markdown-only)"
echo "$MD" | head -20
echo "$MD" | grep -q "User story"

echo "== resolve-board test =="
npm test

echo "E2E OK"
