import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "node:fs";
import { getHolstConfig } from "./holst/config.js";
import { applyPlaywrightEnv, playwrightStatus } from "./holst/playwright-env.js";
import { createServer } from "./mcp/server.js";

function logStderr(message: string): void {
  process.stderr.write(`[holst-mcp] ${message}\n`);
}

function installProcessGuards(): void {
  process.on("unhandledRejection", (reason) => {
    logStderr(
      `unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}`
    );
  });
  process.on("uncaughtException", (err) => {
    logStderr(`uncaughtException: ${err.message}`);
  });
}

function startupChecks(): void {
  applyPlaywrightEnv();
  const config = getHolstConfig();
  const pw = playwrightStatus();

  if (!existsSync(config.storageStatePath)) {
    logStderr(
      `WARN: Holst auth missing (${config.storageStatePath}). Run: npm run holst:login`
    );
  }
  if (!existsSync(joinParserCli(config.parserRoot))) {
    logStderr(`WARN: Parser not found at HOLST_PARSER_ROOT=${config.parserRoot}`);
  }
  if (!pw.launchOk) {
    logStderr(`WARN: ${pw.error ?? "Playwright Chromium not ready"}`);
    logStderr(
      `Fix: npx playwright install chromium (PLAYWRIGHT_BROWSERS_PATH=${pw.browsersPath})`
    );
  }
}

function joinParserCli(parserRoot: string): string {
  return `${parserRoot.replace(/\/$/, "")}/holst_parser/cli.py`;
}

installProcessGuards();
startupChecks();

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);

logStderr("running (stdio)");
