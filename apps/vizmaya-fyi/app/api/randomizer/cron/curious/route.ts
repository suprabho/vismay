import { handleCuriousDailySpinRequest } from '@vismay/html-stories/randomizerApi'

export const dynamic = 'force-dynamic'

/**
 * GET /api/randomizer/cron/curious: the Curious Desk's daily spin. Vercel
 * Cron calls it (vercel.json) with `Authorization: Bearer $CRON_SECRET`; one
 * spin per UTC day unless a kept spin already exists. See
 * packages/html-stories/src/randomizerApi.ts.
 */
export async function GET(req: Request) {
  return handleCuriousDailySpinRequest(req, new URL(req.url).origin)
}
