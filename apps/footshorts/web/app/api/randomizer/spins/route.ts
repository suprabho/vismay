import { handleRandomizerSpinsRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The randomizer's spin log and spin endpoint on footshorts, for agents
 * working a Football Desk spin with this deployment's token
 * (`Authorization: Bearer $HTML_STORIES_TOKEN`). Same contract and the same
 * log as vizmaya.fyi's (packages/html-stories/src/randomizerApi.ts); briefs
 * it hands back point at the spin's own site.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleRandomizerSpinsRequest(req, 'footshorts')
}

export async function POST(req: Request) {
  return handleRandomizerSpinsRequest(req, 'footshorts')
}
