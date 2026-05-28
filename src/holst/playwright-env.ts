import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { env } from "../env.js";

function defaultBrowsersPath(): string {
  const home = homedir();
  if (platform() === "darwin") {
    return join(home, "Library", "Caches", "ms-playwright");
  }
  return join(home, ".cache", "ms-playwright");
}

/** Stable browser cache for MCP (Cursor subprocess may not see sandbox Playwright paths). */
export function resolvePlaywrightBrowsersPath(): string {
  return env("PLAYWRIGHT_BROWSERS_PATH", defaultBrowsersPath()) ?? defaultBrowsersPath();
}

export function applyPlaywrightEnv(): void {
  const browsersPath = resolvePlaywrightBrowsersPath();
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}

export function playwrightStatus(): {
  browsersPath: string;
  browsersPathExists: boolean;
  executablePath: string | null;
  launchOk: boolean;
  error: string | null;
} {
  applyPlaywrightEnv();
  const browsersPath = resolvePlaywrightBrowsersPath();
  let executablePath: string | null = null;
  let launchOk = false;
  let error: string | null = null;

  try {
    executablePath = chromium.executablePath();
    launchOk = Boolean(executablePath && existsSync(executablePath));
    if (!launchOk) {
      error =
        "Chromium executable not found. Run: cd holst-cursor-connector && npx playwright install chromium";
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return {
    browsersPath,
    browsersPathExists: existsSync(browsersPath),
    executablePath,
    launchOk,
    error,
  };
}

export async function assertPlaywrightReady(): Promise<void> {
  const status = playwrightStatus();
  if (!status.launchOk) {
    throw new Error(
      status.error ??
        `Playwright Chromium is not installed (PLAYWRIGHT_BROWSERS_PATH=${status.browsersPath}). ` +
          "Run: npx playwright install chromium"
    );
  }
}
