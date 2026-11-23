/**
 * OAuth protected resource metadata for the Vismay MCP (RFC 9728), at both the
 * path MCP clients try first (/.well-known/oauth-protected-resource/api/mcp)
 * and the root one. See packages/mcp/src/oauth.ts.
 */

import { oauthPreflight, protectedResourceMetadata } from '@vismay/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = protectedResourceMetadata
export const OPTIONS = oauthPreflight
