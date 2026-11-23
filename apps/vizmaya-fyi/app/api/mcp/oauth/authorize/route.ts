/**
 * OAuth authorization endpoint for the Vismay MCP: checks the app's request,
 * then sends the browser to admin's consent page. See packages/mcp/src/oauth.ts.
 */

import { authorize } from '@vismay/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = authorize
