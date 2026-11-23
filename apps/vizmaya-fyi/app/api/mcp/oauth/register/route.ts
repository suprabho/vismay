/** OAuth dynamic client registration for the Vismay MCP (RFC 7591). See packages/mcp/src/oauth.ts. */

import { oauthPreflight, registerClient } from '@vismay/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = registerClient
export const OPTIONS = oauthPreflight
