import { readJsonFile } from "./config.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BOARD_URL_RE =
  /(?:https?:\/\/)?app\.holst\.so\/board\/([0-9a-f-]{36})/i;

export interface ResolvedBoard {
  boardId: string;
  source: "uuid" | "url" | "alias";
  alias?: string;
}

export function isBoardUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function extractBoardIdFromUrl(value: string): string | null {
  const match = value.match(BOARD_URL_RE);
  return match?.[1] ?? null;
}

export function loadBoardAliases(aliasesPath: string): Record<string, string> {
  const raw = readJsonFile<Record<string, string>>(aliasesPath);
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const [alias, boardId] of Object.entries(raw)) {
    if (typeof boardId === "string" && isBoardUuid(boardId)) {
      result[alias.trim()] = boardId.trim();
    }
  }
  return result;
}

export function resolveBoard(input: string, aliasesPath: string): ResolvedBoard {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Board identifier is empty");
  }

  const fromUrl = extractBoardIdFromUrl(trimmed);
  if (fromUrl) {
    return { boardId: fromUrl, source: "url" };
  }

  if (isBoardUuid(trimmed)) {
    return { boardId: trimmed, source: "uuid" };
  }

  const aliases = loadBoardAliases(aliasesPath);
  if (aliases[trimmed]) {
    return { boardId: aliases[trimmed], source: "alias", alias: trimmed };
  }

  const lower = trimmed.toLowerCase();
  const caseInsensitive = Object.entries(aliases).find(
    ([alias]) => alias.toLowerCase() === lower
  );
  if (caseInsensitive) {
    return {
      boardId: caseInsensitive[1],
      source: "alias",
      alias: caseInsensitive[0],
    };
  }

  const partial = Object.entries(aliases).filter(([alias]) =>
    alias.toLowerCase().includes(lower)
  );
  if (partial.length === 1) {
    return {
      boardId: partial[0][1],
      source: "alias",
      alias: partial[0][0],
    };
  }

  throw new Error(
    `Could not resolve board "${input}". Use UUID, app.holst.so/board/{uuid} URL, or add alias to ~/.holst/boards.json`
  );
}
