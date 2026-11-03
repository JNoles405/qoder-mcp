import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SupabaseClient } from "./supabase.js";
import { registerReads, registerWrites } from "./tools/index.js";

export async function startServer() {
  const cfg = loadConfig();
  const sb = new SupabaseClient(cfg.url, cfg.key);
  await sb.signIn(cfg.email, cfg.password);
  // Writes to stderr — stdout is reserved for the MCP transport.
  process.stderr.write(`qoder-mcp: signed in as user ${sb.userId}\n`);

  const server = new McpServer(
    { name: "qoder-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerReads(server, sb);
  registerWrites(server, sb);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
