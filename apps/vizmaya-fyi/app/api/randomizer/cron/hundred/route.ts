import { handleHundredDailySpinRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The 100 Desk's daily spin: Vercel Cron (vercel.json, 05:50 UTC) calls this
 * with `Authorization: Bearer $CRON_SECRET`, and one spin is drawn and logged
 * for the day unless a kept one already exists (a spin made by hand that
 * morning stands). Fails closed without the secret, like the OCW and
 * Landmark Desks' crons. The contract lives in packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleHundredDailySpinRequest(req, new URL(req.url).origin)
}
