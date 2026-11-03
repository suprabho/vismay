import { handleFrontierPoolRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The Frontier Desk's pool: AI Daily's kept arXiv papers (dc_papers) with the
 * desk's areas, windows and lenses and today's counts, or with `paper` (an
 * arXiv id), that paper and its live arXiv and OpenAlex record as a spin
 * would read it. Token-gated; see packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleFrontierPoolRequest(req)
}
