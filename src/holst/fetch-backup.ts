import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type Download, type Page } from "playwright";
import { ensureParentDir } from "./config.js";

export interface FetchBackupOptions {
  boardId: string;
  boardUrl: string;
  storageStatePath: string;
  backupPath: string;
  downloadTimeoutMs: number;
  headless?: boolean;
}

async function waitForBoardReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  const loader = page.locator("#holst-loader");
  if (await loader.count()) {
    await loader.waitFor({ state: "hidden", timeout: 120_000 }).catch(() => undefined);
  }

  await page
    .waitForFunction(
      () => !window.location.pathname.includes("/login"),
      undefined,
      { timeout: 60_000 }
    )
    .catch(() => undefined);
}

async function openBoardMenu(page: Page): Promise<void> {
  // Holst RU UI: board title dropdown (2nd menu trigger in header) has backup export.
  const boardTitleMenu = page.locator('[aria-haspopup="menu"]').nth(1);
  if (await boardTitleMenu.count()) {
    await boardTitleMenu.click({ timeout: 10_000 });
    await page.waitForTimeout(800);
    return;
  }

  const candidates = [
    page.getByRole("button", { name: /board menu|menu|меню|доск/i }),
    page.locator('[data-testid="board-header-menu"]').first(),
    page.locator("header button").first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.count()) {
      await candidate.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
  }

  throw new Error("Could not find board header menu button");
}

async function clickDownloadBackup(page: Page): Promise<void> {
  const labels = [
    /download board backup/i,
    /скачать резервную копию/i,
    /скачать.*бэкап/i,
    /бэкап.*доск/i,
    /backup/i,
  ];

  for (const pattern of labels) {
    const item = page.getByRole("menuitem", { name: pattern }).first();
    if (await item.count()) {
      await item.click({ timeout: 10_000 });
      return;
    }
    const button = page.getByRole("button", { name: pattern }).first();
    if (await button.count()) {
      await button.click({ timeout: 10_000 });
      return;
    }
    const text = page.getByText(pattern).first();
    if (await text.count()) {
      await text.click({ timeout: 10_000 });
      return;
    }
  }

  throw new Error(
    "Could not find 'Download board backup' menu item. UI selectors may have changed."
  );
}

async function saveDownload(download: Download, backupPath: string): Promise<void> {
  ensureParentDir(backupPath);
  await download.saveAs(backupPath);
}

export async function fetchBoardBackup(options: FetchBackupOptions): Promise<{
  backupPath: string;
  downloadedAt: string;
}> {
  if (!existsSync(options.storageStatePath)) {
    throw new Error(
      `Missing Holst auth storage at ${options.storageStatePath}. Run: npm run holst:login`
    );
  }

  const browser = await chromium.launch({
    headless: options.headless ?? true,
  });

  try {
    const context = await browser.newContext({
      storageState: options.storageStatePath,
      acceptDownloads: true,
    });
    const page = await context.newPage();

    const downloadPromise = page.waitForEvent("download", {
      timeout: options.downloadTimeoutMs,
    });

    await page.goto(options.boardUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });

    if (page.url().includes("/login")) {
      throw new Error(
        "Holst session expired or missing. Re-run: npm run holst:login"
      );
    }

    await waitForBoardReady(page);
    await openBoardMenu(page);
    await clickDownloadBackup(page);

    const download = await downloadPromise;
    await saveDownload(download, options.backupPath);

    return {
      backupPath: options.backupPath,
      downloadedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

export function getStorageStateInfo(storageStatePath: string): {
  exists: boolean;
  updatedAt: string | null;
} {
  if (!existsSync(storageStatePath)) {
    return { exists: false, updatedAt: null };
  }
  return {
    exists: true,
    updatedAt: new Date(statSync(storageStatePath).mtimeMs).toISOString(),
  };
}
