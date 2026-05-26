import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HolstConfig } from "./config.js";

export interface ParseCliResult {
  boardId: string;
  boardName: string;
  outputDir: string;
  indexPath: string;
  summaryPath: string;
  frameCount: number;
  parsedAt: string;
}

export interface FrameMeta {
  id: string;
  labelText: string;
  slug: string;
  childCount: number;
  markdownPath: string;
}

function defaultParserRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "python");
}

function parserRoot(config: HolstConfig): string {
  if (existsSync(join(config.parserRoot, "holst_parser", "cli.py"))) {
    return config.parserRoot;
  }
  const fallback = defaultParserRoot();
  if (existsSync(join(fallback, "holst_parser", "cli.py"))) {
    return fallback;
  }
  throw new Error(
    `Holst parser not found. Set HOLST_PARSER_ROOT to directory containing holst_parser/`
  );
}

function runPython(
  config: HolstConfig,
  args: string[]
): Promise<string> {
  const root = parserRoot(config);
  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonPath, ["-m", "holst_parser.cli", ...args], {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: root,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Parser exited with ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function parseBackupFile(
  config: HolstConfig,
  backupPath: string,
  parsedDir: string,
  boardId: string
): Promise<ParseCliResult> {
  const stdout = await runPython(config, [
    "parse",
    backupPath,
    "--out",
    parsedDir,
    "--board-id",
    boardId,
  ]);
  return JSON.parse(stdout) as ParseCliResult;
}

export async function listFrames(
  config: HolstConfig,
  parsedDir: string
): Promise<FrameMeta[]> {
  const stdout = await runPython(config, [
    "list-frames",
    parsedDir,
    "--json",
  ]);
  return JSON.parse(stdout) as FrameMeta[];
}

export async function getFrameMarkdown(
  config: HolstConfig,
  parsedDir: string,
  frameQuery: string
): Promise<{ frame: FrameMeta; markdown: string }> {
  const stdout = await runPython(config, [
    "get-frame",
    parsedDir,
    "--name",
    frameQuery,
    "--json",
  ]);
  return JSON.parse(stdout) as { frame: FrameMeta; markdown: string };
}
