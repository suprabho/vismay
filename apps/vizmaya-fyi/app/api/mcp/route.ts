/**
 * The public Vismay MCP endpoint, https://vizmaya.fyi/api/mcp (Streamable
 * HTTP, stateless). Anyone can read the HTML story brief; a caller who sends
 * a publish token as "Authorization: Bearer <token>" also gets the publishing,
 * story media and randomizer tools, with the token forwarded to the site that
 * checks it. Tool set and auth: packages/mcp/src/hosted.ts; setup:
 * packages/mcp/README.md ("Hosted endpoint").
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
