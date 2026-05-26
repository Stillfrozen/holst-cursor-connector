import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, isFresh } from "./holst/config.js";

export interface BoardPaths {
  boardId: string;
  boardDir: string;
  backupPath: string;
  parsedDir: string;
  indexPath: string;
  summaryPath: string;
}

export function getBoardPaths(cacheDir: string, boardId: string): BoardPaths {
  const boardDir = join(cacheDir, boardId);
  const parsedDir = join(boardDir, "parsed");
  return {
    boardId,
    boardDir,
    backupPath: join(boardDir, "backup.holst"),
    parsedDir,
    indexPath: join(parsedDir, "index.json"),
    summaryPath: join(parsedDir, "board-summary.md"),
  };
}

export function ensureBoardDirs(paths: BoardPaths): void {
  ensureDir(paths.boardDir);
  ensureDir(paths.parsedDir);
}

export function shouldDownloadBackup(
  backupPath: string,
  force: boolean,
  ttlMinutes: number
): boolean {
  if (force) return true;
  return !isFresh(backupPath, ttlMinutes);
}

export function needsParse(
  indexPath: string,
  backupPath: string,
  force: boolean
): boolean {
  if (force) return true;
  if (!existsSync(indexPath)) return true;
  if (!existsSync(backupPath)) return false;
  return statSync(backupPath).mtimeMs > statSync(indexPath).mtimeMs;
}
