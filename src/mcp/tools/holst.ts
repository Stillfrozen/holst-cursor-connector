import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
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
import { errorResult, safeTool, textResult } from "../shape.js";
import { playwrightStatus } from "../../holst/playwright-env.js";

export function registerHolstTools(server: McpServer): void {
  const config = getHolstConfig();

  server.registerTool(
    "holst_login_status",
    {
      title: "Holst login status",
      description: "Check whether Holst Playwright storageState auth file exists.",
      inputSchema: z.object({}),
    },
    async () =>
      safeTool(async () => {
        const info = getStorageStateInfo(config.storageStatePath);
        const pw = playwrightStatus();
        return textResult({
          storageStatePath: config.storageStatePath,
          exists: info.exists,
          updatedAt: info.updatedAt,
          setupCommand: "npm run holst:login",
          playwright: pw,
        });
      })
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
    async ({ backup_path, board_id, output_dir }) =>
      safeTool(async () => {
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
      return textResult({
        ...result,
        frameCount: frames.length,
        frames: frames.map((f) => ({
          id: f.id,
          labelText: f.labelText,
          slug: f.slug,
          childCount: f.childCount,
        })),
      });
    })
  );

  server.registerTool(
    "holst_sync_board",
    {
      title: "Sync Holst board",
      description:
        "Parse cached .holst backup to markdown (default, MCP-safe). Optional Playwright download only when skip_download=false.",
      inputSchema: z.object({
        board: z
          .string()
          .describe("Board UUID, app.holst.so/board URL, or alias from ~/.holst/boards.json"),
        force: z
          .boolean()
          .optional()
          .describe(
            "Force re-parse cached backup. Download only if skip_download=false (otherwise use CLI holst:fetch)"
          ),
        ttl_minutes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Backup cache TTL in minutes"),
        headless: z.boolean().optional().describe("Run browser headless"),
        skip_download: z
          .boolean()
          .optional()
          .describe(
            "Only parse cached backup; never launch Playwright (safe for MCP; use CLI holst:fetch to refresh backup)"
          ),
      }),
    },
    async ({ board, force = false, ttl_minutes, headless, skip_download = true }) =>
      safeTool(async () => {
      const resolved = resolveBoard(board, config.aliasesPath);
      const paths = getBoardPaths(config.cacheDir, resolved.boardId);
      const ttl = ttl_minutes ?? config.defaultTtlMinutes;

      let downloaded = false;
      let downloadedAt: string | null = null;
      // force=true with default skip_download=true → re-parse only (safe for MCP).
      // Playwright download only when skip_download=false explicitly.
      const needsDownload =
        !skip_download && shouldDownloadBackup(paths.backupPath, force, ttl);

      if (!existsSync(paths.backupPath) && skip_download) {
        return errorResult(
          "No cached backup and skip_download=true (MCP-safe mode). Refresh backup via CLI, then sync again:\n" +
            `  cd holst-cursor-connector && npm run holst:fetch -- \"${resolved.alias ?? board}\"`,
          { backupPath: paths.backupPath, force, ttlMinutes: ttl, skip_download }
        );
      }

      if (needsDownload) {
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
        frameCount: frames.length,
        frames: frames.map((f) => ({
          id: f.id,
          labelText: f.labelText,
          slug: f.slug,
          childCount: f.childCount,
        })),
        mcpHint: skip_download
          ? "MCP mode: backup refresh via `npm run holst:fetch -- \"<board>\"` in holst-cursor-connector, then holst_sync_board(force=true)."
          : "Playwright download in MCP may time out on large boards; prefer CLI holst:fetch if connection drops.",
      });
    })
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
    async ({ board }) =>
      safeTool(async () => {
        const resolved = resolveBoard(board, config.aliasesPath);
        const paths = getBoardPaths(config.cacheDir, resolved.boardId);
        const frames = await listFrames(config, paths.parsedDir);
        return textResult({
          board: resolved,
          paths,
          frameCount: frames.length,
          frames,
        });
      })
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
    async ({ board, frame }) =>
      safeTool(async () => {
        const resolved = resolveBoard(board, config.aliasesPath);
        const paths = getBoardPaths(config.cacheDir, resolved.boardId);
        const result = await getFrameMarkdown(config, paths.parsedDir, frame);
        const maxChars = Number(process.env.HOLST_MCP_MAX_FRAME_CHARS ?? "400000");
        let markdown = result.markdown;
        let truncated = false;
        if (markdown.length > maxChars) {
          markdown =
            markdown.slice(0, maxChars) +
            `\n\n… [truncated ${markdown.length - maxChars} chars; open cache file: ${paths.parsedDir}/frames/]`;
          truncated = true;
        }
        return textResult({
          board: resolved,
          paths,
          frame: result.frame,
          markdown,
          truncated,
        });
      })
  );
}
