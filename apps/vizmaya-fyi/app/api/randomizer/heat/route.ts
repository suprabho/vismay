import { handleDeskHeatRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The Desk's heat layer: GET every sub-industry's heat and staleness, POST a
 * refresh (successes and failures) from the weekly refresh job (the MCP
 * `refresh_desk_heat` tool). Token-gated; see
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleDeskHeatRequest(req)
}

export async function POST(req: Request) {
  return handleDeskHeatRequest(req)
}
