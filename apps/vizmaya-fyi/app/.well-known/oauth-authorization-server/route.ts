/** OAuth authorization server metadata for the Vismay MCP (RFC 8414). See packages/mcp/src/oauth.ts. */

import { authorizationServerMetadata, oauthPreflight } from '@vismay/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = authorizationServerMetadata
export const OPTIONS = oauthPreflight
