import { handleRandomizerSpinsRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The randomizer's spin log and spin endpoint for agents and the MCP server
 * (`spin_randomizer`): `Authorization: Bearer $HTML_STORIES_TOKEN`. The
 * contract lives in packages/html-stories/src/randomizerApi.ts; admin spins
 * through its own session-gated route.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleRandomizerSpinsRequest(req)
}

export async function POST(req: Request) {
  return handleRandomizerSpinsRequest(req)
}
