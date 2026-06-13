/**
 * Builds the Vismay MCP server and registers all four tools.
 *
 * Exposing the viz-engine verticals over MCP lets an orchestrator agent (Claude
 * Desktop / Agent SDK / Cursor) that also has HeyGen's Remote MCP connector
 * drive both: render a Vismay visualization here, then hand the asset to
 * HeyGen's generate_avatar_video. HeyGen is server-only and cannot call us, so
 * the agent is the bridge between the two MCP servers.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadConfig } from './config.js'
import { registerListTools } from './tools/listVerticals.js'
import { registerEmbedUrlTool } from './tools/embedUrl.js'
import { registerRenderModuleImageTool } from './tools/renderModuleImage.js'
import { registerRenderStoryVideoTool } from './tools/renderStoryVideo.js'

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

  return server
}
