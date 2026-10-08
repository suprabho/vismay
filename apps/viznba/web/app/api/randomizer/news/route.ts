import { handleViznbaNewsRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The NBA Desk's live news snapshot (conferences and all 30 franchises, their
 * news heat, headlines, the people in the news, recent and next games): what
 * a viznba spin draws from. Token-gated; see
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleViznbaNewsRequest(req)
}
