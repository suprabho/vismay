/**
 * The public Vismay MCP server: Streamable HTTP, stateless, served by
 * vizmaya-fyi at two URLs (apps/vizmaya-fyi/app/api/mcp/).
 *
 *   /api/mcp         the sign-in endpoint. An MCP client that connects with no
 *                    credentials gets a 401 pointing at the OAuth metadata
 *                    (./oauth.ts), so Claude, Claude Code and Cursor open the
 *                    sign-in on their own. Signed in, it has every hosted tool.
 *   /api/mcp/public  no sign-in: the open tools for anyone.
 *
 * Who gets which tools, on either URL:
 *   - anyone: get_html_story_brief (the brief, its styles and formats) and,
 *     when the deployment sets CATALOG_BASE_URL, list_verticals, list_modules
 *     and embed_url. On /api/mcp, "anyone" has to sign in or send a token first.
 *   - signed in (OAuth, /api/mcp only): also publish_html_story, the story
 *     media tools and the randomizer tools, acting with this deployment's own
 *     publish tokens (the env vars the local server reads, same fallbacks).
 *   - a caller who sends a publish token: the same tools with the caller's
 *     own token (`Authorization: Bearer <token>` for vizmaya-fyi,
 *     `x-footshorts-token`, `x-vizf1-token`, `x-viznba-token`, `x-travel-token`
 *     for those sites, each falling back to the bearer), forwarded to the site,
 *     which checks it. A wrong token gets the site's 401.
 *   - nobody: render_module_image and render_story_video (a browser and
 *     ffmpeg), the HeyGen tools (renders outlast a request), and every
 *     `filePath` argument (./localFiles.ts).
 *
 * An OAuth access token is never forwarded to a site, and the deployment's own
 * publish tokens are only used for a verified sign-in.
 *
 * Every POST builds a fresh server and transport and answers with JSON, so the
 * endpoint runs on serverless functions with no session store.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  catalogConfigured,
  envHtmlStoriesToken,
  HOSTED_TOKEN_HEADERS,
  loadConfig,
  type HtmlStoryApp,
  type VismayMcpConfig,
} from './config'
import { isMcpAccessToken, MCP_SCOPE, oauthUrls, verifyAccessToken } from './oauth'
import { registerListTools } from './tools/listVerticals'
import { registerEmbedUrlTool } from './tools/embedUrl'
import { registerHtmlStoryBriefTool, registerHtmlStoryPublishTools } from './tools/htmlStories'
import { registerRandomizerTools } from './tools/randomizer'

/** The publish tokens a caller sent, by app. */
export type CallerTokens = Partial<Record<HtmlStoryApp, string>>

/** Who is calling: nobody, someone with their own publish tokens, or a verified sign-in. */
export type HostedCaller = { kind: 'anonymous' } | { kind: 'tokens'; tokens: CallerTokens } | { kind: 'signed-in' }

function bearerOf(headers: Headers): string | undefined {
  return /^Bearer\s+(\S+)\s*$/i.exec(headers.get('authorization') ?? '')?.[1]
}

/**
 * Read the caller's publish tokens: the bearer for vizmaya-fyi, each site's own
 * header else the bearer. An OAuth access token is not a publish token and is
 * never forwarded, so it is left out.
 */
export function callerTokens(headers: Headers): CallerTokens {
  const raw = bearerOf(headers)
  const bearer = raw && !isMcpAccessToken(raw) ? raw : undefined
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
export function createHostedServer(caller: HostedCaller): McpServer {
  const tokens = caller.kind === 'tokens' ? caller.tokens : {}
  const config: VismayMcpConfig = {
    ...loadConfig(),
    hosted: true,
    tokenFor: caller.kind === 'signed-in' ? envHtmlStoriesToken : (app) => tokens[app] ?? null,
  }
  const full = caller.kind === 'signed-in' || (caller.kind === 'tokens' && Object.values(tokens).some(Boolean))
  const catalog = catalogConfigured()

  const open = ['read the HTML story brief (get_html_story_brief)']
  if (catalog) open.push('list the viz modules and build live embed URLs for them')
  const more = 'publish HTML stories, host their images and use the story randomizers'
  const local = 'Rendering images and videos needs the local server (packages/mcp in the vismay repo).'
  const instructions =
    caller.kind === 'signed-in'
      ? `Vismay's hosted MCP, signed in: ${open.join('; ')}; ${more}. ${local}`
      : full
        ? `Vismay's hosted MCP, with a publish token: ${open.join('; ')}; ${more}. Each site checks the token, so a ` +
          `wrong one comes back as HTTP 401 from the tool. ${local}`
        : `Vismay's hosted MCP. Without a token you can ${open.join(' and ')}. To ${more}, connect to /api/mcp and ` +
          `sign in, or ${TOKEN_HELP}.`

  const server = new McpServer({ name: 'vismay', version: '0.0.0' }, { instructions })
  if (catalog) {
    registerListTools(server, config)
    registerEmbedUrlTool(server, config)
  }
  registerHtmlStoryBriefTool(server, config)
  if (full) {
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
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version, www-authenticate',
  'access-control-max-age': '86400',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return withCors(Response.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status, headers }))
}

/** The 401 that starts an MCP client's sign-in (RFC 9728 §5.1): it names the resource metadata. */
function signInChallenge(req: Request, invalidToken: boolean): Response {
  const u = oauthUrls(req)
  const params = [`resource_metadata="${u.resourceMetadata}"`, `scope="${MCP_SCOPE}"`]
  if (invalidToken) params.unshift('error="invalid_token"', 'error_description="The access token is invalid or expired"')
  return rpcError(
    401,
    -32001,
    invalidToken
      ? 'The sign-in has expired or was revoked. Sign in again.'
      : `Sign in to use the Vismay MCP: add ${u.resource} to an MCP client and it opens the sign-in. ` +
          `Without signing in, ${new URL(req.url).origin}/api/mcp/public has the open tools.`,
    { 'www-authenticate': `Bearer ${params.join(', ')}` },
  )
}

/**
 * Work out who is calling. On the sign-in endpoint a request with no
 * credentials, or with an access token that doesn't verify, gets the 401; on
 * the public one it is anonymous, and an access token is simply ignored.
 */
export function resolveCaller(req: Request, signIn: boolean): HostedCaller | Response {
  const bearer = bearerOf(req.headers)
  if (bearer && isMcpAccessToken(bearer) && signIn) {
    return verifyAccessToken(bearer, oauthUrls(req).resource) ? { kind: 'signed-in' } : signInChallenge(req, true)
  }
  const tokens = callerTokens(req.headers)
  if (Object.values(tokens).some(Boolean)) return { kind: 'tokens', tokens }
  return signIn ? signInChallenge(req, false) : { kind: 'anonymous' }
}

async function handle(req: Request, signIn: boolean): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return rpcError(
      405,
      -32000,
      'This is the Vismay MCP endpoint (Streamable HTTP, stateless). Add this URL to an MCP client as a ' +
        'remote server; it answers JSON-RPC over POST.',
      { allow: 'POST, OPTIONS' },
    )
  }

  const caller = resolveCaller(req, signIn)
  if (caller instanceof Response) return caller
  const server = createHostedServer(caller)
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

/**
 * /api/mcp: the sign-in endpoint. POST carries JSON-RPC; there are no
 * sessions, so GET (a server-to-client stream) and DELETE (ending a session)
 * are refused with 405, which the Streamable HTTP spec allows.
 */
export function handleHostedMcpRequest(req: Request): Promise<Response> {
  return handle(req, true)
}

/** /api/mcp/public: the same server with no sign-in; anonymous callers get the open tools. */
export function handlePublicMcpRequest(req: Request): Promise<Response> {
  return handle(req, false)
}
