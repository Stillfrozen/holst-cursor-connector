import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHolstTools } from "./tools/holst.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "holst-cursor",
    version: "1.0.0",
  });

  registerHolstTools(server);
  return server;
}
