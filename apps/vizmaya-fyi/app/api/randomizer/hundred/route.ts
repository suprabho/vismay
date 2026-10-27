import { handleHundredPoolRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The 100 Desk's pool: Hart's whole ranking with its domains, eras and
 * lenses, or with `rank`, that person's live profile (Wikidata, Wikipedia,
 * pageviews) as a spin would read it. Token-gated; see
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleHundredPoolRequest(req)
}
