import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getBoardPaths, needsParse, shouldDownloadBackup } from "../../cache.js";
import { getHolstConfig } from "../../holst/config.js";
import {
  fetchBoardBackup,
  getStorageStateInfo,
} from "../../holst/fetch-backup.js";
import {
  getFrameMarkdown,
  listFrames,
  parseBackupFile,
} from "../../holst/parser-runner.js";
import { resolveBoard } from "../../holst/resolve-board.js";
import { textResult } from "../shape.js";

export function registerHolstTools(server: McpServer): void {
  const config = getHolstConfig();

  server.registerTool(
    "holst_login_status",
    {
      title: "Holst login status",
      description: "Check whether Holst Playwright storageState auth file exists.",
      inputSchema: z.object({}),
    },
    async () => {
      const info = getStorageStateInfo(config.storageStatePath);
      return textResult({
        storageStatePath: config.storageStatePath,
        exists: info.exists,
        updatedAt: info.updatedAt,
        setupCommand: "npm run holst:login",
      });
    }
  );

  server.registerTool(
    "holst_parse_backup",
    {
      title: "Parse Holst backup",
      description:
        "Parse a local .holst backup file into markdown frames for LLM consumption.",
      inputSchema: z.object({
        backup_path: z.string().describe("Absolute path to .holst file"),
        board_id: z.string().optional().describe("Optional board UUID override"),
        output_dir: z
          .string()
          .optional()
          .describe("Optional parsed output directory"),
      }),
    },
    async ({ backup_path, board_id, output_dir }) => {
      let resolvedBoardId = board_id;
      if (!resolvedBoardId) {
        try {
          resolvedBoardId = resolveBoard(backup_path, config.aliasesPath).boardId;
        } catch {
          resolvedBoardId = backup_path
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.holst$/i, "")
            .trim() || "board";
        }
      }

      const paths = output_dir
        ? {
            ...getBoardPaths(config.cacheDir, resolvedBoardId),
            parsedDir: output_dir,
            indexPath: `${output_dir}/index.json`,
            summaryPath: `${output_dir}/board-summary.md`,
          }
        : getBoardPaths(config.cacheDir, resolvedBoardId);

      const result = await parseBackupFile(
        config,
        backup_path,
        paths.parsedDir,
        resolvedBoardId
      );
      const frames = await listFrames(config, paths.parsedDir);
      return textResult({ ...result, frames });
    }
  );

  server.registerTool(
    "holst_sync_board",
    {
      title: "Sync Holst board",
      description:
        "Download .holst backup via Playwright if cache is stale, then parse to markdown.",
      inputSchema: z.object({
        board: z
          .string()
          .describe("Board UUID, app.holst.so/board URL, or alias from ~/.holst/boards.json"),
        force: z.boolean().optional().describe("Force re-download and re-parse"),
        ttl_minutes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Backup cache TTL in minutes"),
        headless: z.boolean().optional().describe("Run browser headless"),
      }),
    },
    async ({ board, force = false, ttl_minutes, headless }) => {
      const resolved = resolveBoard(board, config.aliasesPath);
      const paths = getBoardPaths(config.cacheDir, resolved.boardId);
      const ttl = ttl_minutes ?? config.defaultTtlMinutes;

      let downloaded = false;
      let downloadedAt: string | null = null;

      if (shouldDownloadBackup(paths.backupPath, force, ttl)) {
        const fetchResult = await fetchBoardBackup({
          boardId: resolved.boardId,
          boardUrl: `${config.holstBaseUrl}/board/${resolved.boardId}`,
          storageStatePath: config.storageStatePath,
          backupPath: paths.backupPath,
          downloadTimeoutMs: config.downloadTimeoutMs,
          headless,
        });
        downloaded = true;
        downloadedAt = fetchResult.downloadedAt;
      }

      let parsed = false;
      let parseResult = null;
      if (needsParse(paths.indexPath, paths.backupPath, force || downloaded)) {
        parseResult = await parseBackupFile(
          config,
          paths.backupPath,
          paths.parsedDir,
          resolved.boardId
        );
        parsed = true;
      }

      const frames = await listFrames(config, paths.parsedDir);
      return textResult({
        board: resolved,
        downloaded,
        downloadedAt,
        parsed,
        paths,
        parseResult,
        frames,
      });
    }
  );

  server.registerTool(
    "holst_list_frames",
    {
      title: "List Holst frames",
      description: "List frames from a synced/parsed Holst board cache.",
      inputSchema: z.object({
        board: z.string().describe("Board UUID, URL, or alias"),
      }),
    },
    async ({ board }) => {
      const resolved = resolveBoard(board, config.aliasesPath);
      const paths = getBoardPaths(config.cacheDir, resolved.boardId);
      const frames = await listFrames(config, paths.parsedDir);
      return textResult({ board: resolved, paths, frames });
    }
  );

  server.registerTool(
    "holst_get_frame",
    {
      title: "Get Holst frame",
      description:
        "Return markdown content for a frame by label, slug, or id from parsed cache.",
      inputSchema: z.object({
        board: z.string().describe("Board UUID, URL, or alias"),
        frame: z.string().describe("Frame label, slug, or id"),
      }),
    },
    async ({ board, frame }) => {
      const resolved = resolveBoard(board, config.aliasesPath);
      const paths = getBoardPaths(config.cacheDir, resolved.boardId);
      const result = await getFrameMarkdown(config, paths.parsedDir, frame);
      return textResult({
        board: resolved,
        paths,
        frame: result.frame,
        markdown: result.markdown,
      });
    }
  );
}
