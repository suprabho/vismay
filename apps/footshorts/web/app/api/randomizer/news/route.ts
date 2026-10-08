import { handleFootshortsNewsRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The Football Desk's live news snapshot (tournaments and teams with
 * fixtures, their news heat, headlines and fixtures): what a footshorts
 * spin draws from. Token-gated; see packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleFootshortsNewsRequest(req)
}
