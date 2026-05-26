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
