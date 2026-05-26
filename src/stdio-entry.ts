import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp/server.js";

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);

process.stderr.write("Holst MCP server running (stdio mode)\n");
