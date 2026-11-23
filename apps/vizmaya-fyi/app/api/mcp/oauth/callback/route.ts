/**
 * Where admin's consent page sends its decision; an approved sign-in becomes an
 * authorization code for the app. See packages/mcp/src/oauth.ts.
 */

import { callback } from '@vismay/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = callback
