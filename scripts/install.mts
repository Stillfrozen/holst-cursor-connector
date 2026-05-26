import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configureMcp = process.argv.includes("--configure-mcp");
const skipBuild = process.argv.includes("--skip-build");

function run(cmd: string, args: string[], cwd = repoRoot): void {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Holst connector root: ${repoRoot}`);

if (!skipBuild) {
  console.log("\n[1/5] npm install");
  run("npm", ["install"]);
  console.log("\n[2/5] npm run build");
  run("npm", ["run", "build"]);
  console.log("\n[3/5] playwright chromium");
  run("npx", ["playwright", "install", "chromium"]);
} else {
  console.log("\n[skip] npm install / build / playwright (--skip-build)");
}

const holstDir = join(homedir(), ".holst");
const cacheDir = join(homedir(), ".cache", "holst-boards");
mkdirSync(holstDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const boardsPath = join(holstDir, "boards.json");
if (!existsSync(boardsPath)) {
  copyFileSync(join(repoRoot, "examples", "boards.json"), boardsPath);
  console.log(`\n[4/5] Created ${boardsPath} from examples/boards.json`);
} else {
  console.log(`\n[4/5] boards.json already exists: ${boardsPath}`);
}

const skillDestDir = join(homedir(), ".cursor", "skills", "holst");
mkdirSync(skillDestDir, { recursive: true });
const skillSrc = readFileSync(join(repoRoot, "skills", "holst", "SKILL.md"), "utf8");
const skillOut = skillSrc.replaceAll("{{HOLST_CONNECTOR_ROOT}}", repoRoot);
writeFileSync(join(skillDestDir, "SKILL.md"), skillOut, "utf8");
console.log(`[5/5] Installed skill → ${join(skillDestDir, "SKILL.md")}`);

const mcpEntry = {
  holst: {
    command: "node",
    args: [join(repoRoot, "dist", "stdio-entry.js")],
    env: {
      HOLST_STORAGE_STATE: join(holstDir, "auth.json"),
      HOLST_CACHE_DIR: cacheDir,
      HOLST_PARSER_ROOT: join(repoRoot, "python"),
    },
  },
};

const snippetPath = join(repoRoot, "examples", "mcp-snippet.json");
writeFileSync(snippetPath, `${JSON.stringify(mcpEntry, null, 2)}\n`, "utf8");
console.log(`\nMCP snippet written to ${snippetPath}`);

if (configureMcp) {
  const mcpPath = join(homedir(), ".cursor", "mcp.json");
  let config: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
  if (existsSync(mcpPath)) {
    config = JSON.parse(readFileSync(mcpPath, "utf8")) as typeof config;
    config.mcpServers ??= {};
  } else {
    mkdirSync(dirname(mcpPath), { recursive: true });
  }
  config.mcpServers!.holst = mcpEntry.holst;
  writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Merged holst server into ${mcpPath}`);
} else {
  console.log("\nAdd to ~/.cursor/mcp.json under mcpServers (or re-run with --configure-mcp):");
  console.log(JSON.stringify(mcpEntry, null, 2));
}

console.log("\nNext: npm run holst:login");
console.log("Then reload MCP in Cursor (Settings → MCP → refresh).");
