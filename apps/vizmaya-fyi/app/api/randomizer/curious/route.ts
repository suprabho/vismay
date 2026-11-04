import { handleCuriousPoolRequest } from '@vismay/html-stories/randomizerApi'

export const dynamic = 'force-dynamic'

/**
 * GET /api/randomizer/curious?claim=<id> (token-gated): the Curious Desk's
 * pool of approved claims (eras, themes, grades, lenses, counts, the newest
 * approvals), or one claim with its live record. See
 * packages/html-stories/src/randomizerApi.ts.
 */
export async function GET(req: Request) {
  return handleCuriousPoolRequest(req)
}
