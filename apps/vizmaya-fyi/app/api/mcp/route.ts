/**
 * The Vismay MCP sign-in endpoint, https://vizmaya.fyi/api/mcp (Streamable
 * HTTP, stateless). An MCP client that connects with no credentials gets a 401
 * that starts the OAuth sign-in (packages/mcp/src/oauth.ts; people allow it on
 * admin's /mcp/authorize page); signed in, it has every hosted tool. A caller
 * who sends a publish token as "Authorization: Bearer <token>" gets the same
 * tools with that token. No sign-in: /api/mcp/public. Tool set and auth:
 * packages/mcp/src/hosted.ts; setup: packages/mcp/README.md ("Hosted endpoint").
 */

import { handleHostedMcpRequest } from '@vismay/mcp/hosted'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The tools call this site's own APIs, some of which read live sources (MIT
// Learn, the Nobel Prize API, OpenAlex) or generate an image.
export const maxDuration = 300

export const POST = handleHostedMcpRequest
export const GET = handleHostedMcpRequest
export const DELETE = handleHostedMcpRequest
export const OPTIONS = handleHostedMcpRequest
