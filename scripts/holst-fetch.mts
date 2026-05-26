import { getHolstConfig } from "../src/holst/config.js";
import { fetchBoardBackup } from "../src/holst/fetch-backup.js";
import { parseBackupFile } from "../src/holst/parser-runner.js";
import { resolveBoard } from "../src/holst/resolve-board.js";
import {
  getBoardPaths,
  needsParse,
  shouldDownloadBackup,
} from "../src/cache.js";

const boardArg = process.argv[2];
if (!boardArg) {
  console.error("Usage: npm run holst:fetch -- <board-id|url|alias>");
  process.exit(1);
}

const config = getHolstConfig();
const resolved = resolveBoard(boardArg, config.aliasesPath);
const paths = getBoardPaths(config.cacheDir, resolved.boardId);
const force = process.argv.includes("--force");

if (shouldDownloadBackup(paths.backupPath, force, config.defaultTtlMinutes)) {
  const result = await fetchBoardBackup({
    boardId: resolved.boardId,
    boardUrl: `${config.holstBaseUrl}/board/${resolved.boardId}`,
    storageStatePath: config.storageStatePath,
    backupPath: paths.backupPath,
    downloadTimeoutMs: config.downloadTimeoutMs,
    headless: !process.argv.includes("--headed"),
  });
  console.log("Downloaded:", result);
}

if (needsParse(paths.indexPath, paths.backupPath, force)) {
  const parsed = await parseBackupFile(
    config,
    paths.backupPath,
    paths.parsedDir,
    resolved.boardId
  );
  console.log("Parsed:", parsed);
} else {
  console.log("Parse skipped — cache is fresh. Use --force to re-parse.");
}
