/**
 * The public Vismay MCP server: Streamable HTTP, stateless, served by
 * vizmaya-fyi at /api/mcp (apps/vizmaya-fyi/app/api/mcp/route.ts).
 *
 * Who gets which tools:
 *   - anyone: get_html_story_brief (the brief, its styles and formats) and,
 *     when the deployment sets CATALOG_BASE_URL, list_verticals, list_modules
 *     and embed_url.
 *   - a caller who sends a publish token: also publish_html_story, the story
 *     media tools and the randomizer tools. The token is the caller's own
 *     (`Authorization: Bearer <token>` for vizmaya-fyi, `x-footshorts-token`,
 *     `x-vizf1-token`, `x-viznba-token`, `x-travel-token` for those sites,
 *     each falling back to the bearer) and is forwarded to the site, which
 *     checks it. This endpoint holds no publish secret of its own: a wrong
 *     token gets the site's 401, the same as calling the site's API directly.
 *   - nobody: render_module_image and render_story_video (a browser and
 *     ffmpeg), the HeyGen tools (the server's HeyGen key, and renders that
 *     outlast a request), and every `filePath` argument (./localFiles.ts).
 *
 * Every POST builds a fresh server and transport and answers with JSON, so the
 * endpoint runs on serverless functions with no session store.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  catalogConfigured,
  HOSTED_TOKEN_HEADERS,
  loadConfig,
  type HtmlStoryApp,
  type VismayMcpConfig,
} from './config'
import { registerListTools } from './tools/listVerticals'
import { registerEmbedUrlTool } from './tools/embedUrl'
import { registerHtmlStoryBriefTool, registerHtmlStoryPublishTools } from './tools/htmlStories'
import { registerRandomizerTools } from './tools/randomizer'

/** The publish tokens a caller sent, by app. */
export type CallerTokens = Partial<Record<HtmlStoryApp, string>>

/** Read the caller's tokens: the bearer for vizmaya-fyi, each site's own header else the bearer. */
export function callerTokens(headers: Headers): CallerTokens {
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(headers.get('authorization') ?? '')?.[1]
  const tokens: CallerTokens = {}
  if (bearer) tokens['vizmaya-fyi'] = bearer
  for (const [app, header] of Object.entries(HOSTED_TOKEN_HEADERS) as Array<[HtmlStoryApp, string]>) {
    const token = headers.get(header)?.trim() || bearer
    if (token) tokens[app] = token
  }
  return tokens
}

const TOKEN_HELP =
  'send your publish token as "Authorization: Bearer <token>" (and x-footshorts-token, x-vizf1-token, ' +
  'x-viznba-token or x-travel-token for those sites when their tokens differ)'

/** The hosted tool set for one request's caller. */
export function createHostedServer(tokens: CallerTokens): McpServer {
  const config: VismayMcpConfig = { ...loadConfig(), hosted: true, tokenFor: (app) => tokens[app] ?? null }
  const withToken = Object.values(tokens).some(Boolean)
  const catalog = catalogConfigured()

  const open = ['read the HTML story brief (get_html_story_brief)']
  if (catalog) open.push('list the viz modules and build live embed URLs for them')
  const instructions = withToken
    ? `Vismay's hosted MCP, with a publish token: ${open.join('; ')}; publish HTML stories, host their images ` +
      'and use the story randomizers. Each site checks the token, so a wrong one comes back as HTTP 401 from the tool. ' +
      'Rendering images and videos needs the local server (packages/mcp in the vismay repo).'
    : `Vismay's hosted MCP. Without a token you can ${open.join(' and ')}. To publish stories, host their images ` +
      `and use the story randomizers, ${TOKEN_HELP}.`

  const server = new McpServer({ name: 'vismay', version: '0.0.0' }, { instructions })
  if (catalog) {
    registerListTools(server, config)
    registerEmbedUrlTool(server, config)
  }
  registerHtmlStoryBriefTool(server, config)
  if (withToken) {
    registerHtmlStoryPublishTools(server, config)
    registerRandomizerTools(server, config)
  }
  return server
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': [
    'authorization',
    'content-type',
    'accept',
    'mcp-protocol-version',
    'mcp-session-id',
    'last-event-id',
    ...Object.values(HOSTED_TOKEN_HEADERS),
  ].join(', '),
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
  'access-control-max-age': '86400',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/**
 * Handle one HTTP request to the hosted endpoint. POST carries JSON-RPC; there
 * are no sessions, so GET (a server-to-client stream) and DELETE (ending a
 * session) are refused with 405, which the Streamable HTTP spec allows.
 */
export async function handleHostedMcpRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return withCors(
      Response.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message:
              'This is the Vismay MCP endpoint (Streamable HTTP, stateless). Add this URL to an MCP client as a ' +
              'remote server; it answers JSON-RPC over POST.',
          },
          id: null,
        },
        { status: 405, headers: { allow: 'POST, OPTIONS' } },
      ),
    )
  }

  const server = createHostedServer(callerTokens(req.headers))
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    // JSON mode resolves once every response is written, so closing after is safe.
    return withCors(await transport.handleRequest(req))
  } finally {
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }
}
