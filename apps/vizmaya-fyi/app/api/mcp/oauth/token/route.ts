/** OAuth token endpoint for the Vismay MCP: codes (with PKCE) and refresh tokens. See packages/mcp/src/oauth.ts. */

import { oauthPreflight, token } from '@vismay/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = token
export const OPTIONS = oauthPreflight
