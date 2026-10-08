import { handleTrendsRequest } from '@vismay/html-stories/randomizerApi'

/**
 * What is trending today: the daily Xpoz snapshot every spin's brief carries
 * (?randomizer= for one randomizer's beats). Token-gated; see
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleTrendsRequest(req)
}
