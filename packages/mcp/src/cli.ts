/**
 * Vismay MCP server entrypoint (stdio transport).
 *
 * Run via `tsx src/cli.ts`. Register it as a "custom connector" in an MCP client
 * (Claude Desktop / Claude Code / Cursor):
 *
 *   {
 *     "mcpServers": {
 *       "vismay": {
 *         "command": "tsx",
 *         "args": ["/abs/path/to/packages/mcp/src/cli.ts"],
 *         "env": { "CATALOG_BASE_URL": "...", "VIZMAYA_BASE_URL": "...",
 *                  "NEXT_PUBLIC_SUPABASE_URL": "...", "SUPABASE_SERVICE_ROLE_KEY": "..." }
 *       }
 *     }
 *   }
 *
 * IMPORTANT: stdout carries the MCP frame stream — nothing else may write to it.
 * All diagnostics go to stderr (console.error).
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[vismay-mcp] ready on stdio')
}

main().catch((err) => {
  console.error('[vismay-mcp] fatal:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
