import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractBoardIdFromUrl,
  isBoardUuid,
  resolveBoard,
} from "../src/holst/resolve-board.js";

const FIXTURE_UUID = "11111111-1111-4111-8111-111111111111";

test("isBoardUuid validates uuid", () => {
  assert.equal(isBoardUuid(FIXTURE_UUID), true);
  assert.equal(isBoardUuid("not-a-uuid"), false);
});

test("extractBoardIdFromUrl", () => {
  assert.equal(
    extractBoardIdFromUrl(`https://app.holst.so/board/${FIXTURE_UUID}`),
    FIXTURE_UUID
  );
});

test("resolveBoard uses alias file", () => {
  const aliasesPath = new URL("./fixtures/boards.json", import.meta.url).pathname;
  const resolved = resolveBoard("Fixture Board", aliasesPath);
  assert.equal(resolved.source, "alias");
  assert.equal(resolved.boardId, FIXTURE_UUID);
});
