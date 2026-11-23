/**
 * The Vismay MCP with no sign-in, https://vizmaya.fyi/api/mcp/public: the open
 * tools for anyone, and the rest for a caller who sends a publish token. The
 * sign-in endpoint is /api/mcp. See packages/mcp/src/hosted.ts.
 */

import { handlePublicMcpRequest } from '@vismay/mcp/hosted'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export const POST = handlePublicMcpRequest
export const GET = handlePublicMcpRequest
export const DELETE = handlePublicMcpRequest
export const OPTIONS = handlePublicMcpRequest
