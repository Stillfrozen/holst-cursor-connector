export type TextContent = {
  content: [{ type: "text"; text: string }];
};

export function textResult(data: unknown): TextContent {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errorResult(message: string, detail?: unknown): TextContent {
  return textResult({
    error: message,
    detail: detail instanceof Error ? { message: detail.message, name: detail.name } : detail,
  });
}

/** Wrap MCP tool handlers so Playwright/parser failures do not kill the stdio process. */
export async function safeTool<T>(
  fn: () => Promise<T>
): Promise<T | TextContent> {
  try {
    return await fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(message, e);
  }
}
