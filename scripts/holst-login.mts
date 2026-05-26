import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const storagePath =
  process.env.HOLST_STORAGE_STATE ?? join(homedir(), ".holst", "auth.json");
const baseUrl = process.env.HOLST_BASE_URL ?? "https://app.holst.so";

mkdirSync(dirname(storagePath), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

console.log(`Open Holst and log in manually: ${baseUrl}/login`);
await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });

console.log(
  "After successful login, press Enter in this terminal to save storageState..."
);
await new Promise<void>((resolve) => {
  process.stdin.resume();
  process.stdin.once("data", () => resolve());
});

await context.storageState({ path: storagePath });
console.log(`Saved Holst auth to ${storagePath}`);
await browser.close();
process.exit(0);
