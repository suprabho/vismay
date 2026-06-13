/**
 * Builds the Vismay MCP server and registers all tools.
 *
 * Exposing the viz-engine verticals over MCP lets an orchestrator agent (Claude
 * Desktop / Agent SDK / Cursor) render a Vismay visualization here, then drive a
 * HeyGen render directly via the `*_heygen_*` tools (which wrap HeyGen's
 * Template API) — render the Vismay asset, feed it into a template variable, and
 * generate. The HeyGen client is pure HTTP, so these tools call it in-process
 * rather than bridging to a separate MCP server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadConfig } from './config.js'
import { registerListTools } from './tools/listVerticals.js'
import { registerEmbedUrlTool } from './tools/embedUrl.js'
import { registerRenderModuleImageTool } from './tools/renderModuleImage.js'
import { registerRenderStoryVideoTool } from './tools/renderStoryVideo.js'
import { registerHeygenTools } from './tools/heygenVideo.js'

export function createServer(): McpServer {
  const config = loadConfig()
  const server = new McpServer({
    name: 'vismay',
    version: '0.0.0',
  })

  registerListTools(server, config)
  registerEmbedUrlTool(server, config)
  registerRenderModuleImageTool(server, config)
  registerRenderStoryVideoTool(server, config)
  registerHeygenTools(server, config)

  return server
}
