import { handleLandmarkPoolRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The Landmark Desk's pool (the awards of one prize in one era from the
 * Nobel Prize API or Wikidata, or one laureate's works from Wikidata,
 * OpenAlex, Open Library and Unpaywall), or the taxonomy without a query:
 * what a Landmark spin draws from. Token-gated; see
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleLandmarkPoolRequest(req)
}
