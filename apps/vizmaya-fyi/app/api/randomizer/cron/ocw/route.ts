import { handleOcwDailySpinRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The OCW Desk's daily spin: Vercel Cron (vercel.json, 05:30 UTC) calls this
 * with `Authorization: Bearer $CRON_SECRET`, and one OCW spin is drawn and
 * logged for the day unless a kept one already exists (a spin made by hand
 * that morning stands). Fails closed without the secret, like the AI Data
 * Centers crons. The contract lives in packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleOcwDailySpinRequest(req, new URL(req.url).origin)
}
