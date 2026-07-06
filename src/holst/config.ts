import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

const DEFAULT_STORAGE = join(homedir(), ".holst", "auth.json");
const DEFAULT_CACHE = join(homedir(), ".cache", "holst-boards");
const DEFAULT_ALIASES = join(homedir(), ".holst", "boards.json");
const DEFAULT_TTL_MINUTES = 60;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

export interface HolstConfig {
  storageStatePath: string;
  cacheDir: string;
  aliasesPath: string;
  pythonPath: string;
  parserRoot: string;
  defaultTtlMinutes: number;
  downloadTimeoutMs: number;
  holstBaseUrl: string;
}

function defaultParserRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "python");
}

function resolveParserRoot(): string {
  const fromEnv = env("HOLST_PARSER_ROOT");
  if (fromEnv && existsSync(join(fromEnv, "holst_parser", "cli.py"))) {
    return fromEnv;
  }
  const fallback = defaultParserRoot();
  if (existsSync(join(fallback, "holst_parser", "cli.py"))) {
    return fallback;
  }
  return fromEnv ?? fallback;
}

export function getHolstConfig(): HolstConfig {
  return {
    storageStatePath: env("HOLST_STORAGE_STATE", DEFAULT_STORAGE) ?? DEFAULT_STORAGE,
    cacheDir: env("HOLST_CACHE_DIR", DEFAULT_CACHE) ?? DEFAULT_CACHE,
    aliasesPath: env("HOLST_BOARDS_ALIASES", DEFAULT_ALIASES) ?? DEFAULT_ALIASES,
    pythonPath: env("HOLST_PYTHON", "python3") ?? "python3",
    parserRoot: resolveParserRoot(),
    defaultTtlMinutes: Number(env("HOLST_CACHE_TTL_MINUTES", String(DEFAULT_TTL_MINUTES))),
    downloadTimeoutMs: Number(
      env("HOLST_DOWNLOAD_TIMEOUT_MS", String(DEFAULT_DOWNLOAD_TIMEOUT_MS))
    ),
    holstBaseUrl: env("HOLST_BASE_URL", "https://app.holst.so") ?? "https://app.holst.so",
  };
}

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function ensureParentDir(path: string): void {
  ensureDir(dirname(path));
}

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export function fileAgeMinutes(path: string): number | null {
  if (!existsSync(path)) return null;
  const mtime = statSync(path).mtimeMs;
  return (Date.now() - mtime) / 60000;
}

export function isFresh(path: string, ttlMinutes: number): boolean {
  const age = fileAgeMinutes(path);
  if (age === null) return false;
  return age <= ttlMinutes;
}
