import { handleLandmarkDailySpinRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The Landmark Desk's daily spin: Vercel Cron (vercel.json, 05:45 UTC) calls
 * this with `Authorization: Bearer $CRON_SECRET`, and one Landmark spin is
 * drawn and logged for the day unless a kept one already exists (a spin made
 * by hand that morning stands). Fails closed without the secret, like the
 * OCW Desk's cron. The contract lives in packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleLandmarkDailySpinRequest(req, new URL(req.url).origin)
}
