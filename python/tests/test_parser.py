import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from holst_parser.frames import assign_object_to_frame, build_frames, find_frame_by_query
from holst_parser.parse import parse_board_data
from holst_parser.slate import extract_plain_text, extract_text_from_json_state


class SlateTests(unittest.TestCase):
    def test_extract_bold_text(self):
        json_state = {
            "children": json.dumps(
                [
                    {
                        "type": "wrapper",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [{"bold": True, "text": "User story"}],
                            }
                        ],
                    }
                ]
            )
        }
        self.assertIn("**User story**", extract_text_from_json_state(json_state))
        self.assertEqual("User story", extract_plain_text(json_state))


class FrameTests(unittest.TestCase):
    def test_assign_by_parent(self):
        objects = [
            {
                "id": "frame-1",
                "type": "frame",
                "labelText": "Vitri",
                "bounds": {"x": 0, "y": 0, "width": 100, "height": 100},
            },
            {
                "id": "st-1",
                "type": "sticker",
                "parentId": "frame-1",
                "bounds": {"x": 10, "y": 10, "width": 20, "height": 20},
            },
        ]
        frames = build_frames(objects)
        self.assertEqual("frame-1", assign_object_to_frame(objects[1], frames))
        match = find_frame_by_query(frames, "vitri")
        self.assertIsNotNone(match)
        self.assertEqual("frame-1", match.id)


class ParseTests(unittest.TestCase):
    def test_parse_minimal_backup(self):
        data = {
            "boardName": "Test board",
            "version": 1,
            "objects": [
                {
                    "id": "f1",
                    "type": "frame",
                    "labelText": "Frame A",
                    "bounds": {"x": 0, "y": 0, "width": 500, "height": 500},
                    "zIndex": 1,
                },
                {
                    "id": "s1",
                    "type": "sticker",
                    "parentId": "f1",
                    "zIndex": 2,
                    "jsonState": {
                        "children": json.dumps(
                            [
                                {
                                    "type": "wrapper",
                                    "children": [
                                        {
                                            "type": "paragraph",
                                            "children": [{"text": "Hello sticker"}],
                                        }
                                    ],
                                }
                            ]
                        )
                    },
                    "bounds": {"x": 10, "y": 10, "width": 100, "height": 100},
                },
            ],
            "comments": [],
        }

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            backup = tmp_path / "test.holst"
            with zipfile.ZipFile(backup, "w") as archive:
                archive.writestr("data.json", json.dumps(data))

            parsed_dir = tmp_path / "parsed"
            loaded = json.loads(
                zipfile.ZipFile(backup).read("data.json").decode("utf-8")
            )
            result = parse_board_data(
                loaded,
                board_id="board-test",
                backup_path=backup,
                output_dir=parsed_dir,
            )
            self.assertTrue(result.index_path.exists())
            index = json.loads(result.index_path.read_text(encoding="utf-8"))
            self.assertEqual("Test board", index["boardName"])
            self.assertEqual(1, index["frames"][0]["childCount"])
            frame_md = parsed_dir / "frames" / f"{index['frames'][0]['slug']}.md"
            self.assertTrue(frame_md.exists())
            self.assertIn("Hello sticker", frame_md.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
