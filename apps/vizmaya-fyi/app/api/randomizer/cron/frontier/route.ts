import { handleFrontierDailySpinRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The Frontier Desk's daily spin: Vercel Cron (vercel.json, 09:20 UTC, after
 * AI Daily's papers job and the Doom v Boom publish, so the morning's papers
 * and featured marks are in) calls this with `Authorization: Bearer
 * $CRON_SECRET`, and one spin is drawn and logged for the day unless a kept
 * one already exists (a spin made by hand that morning stands). Fails closed
 * without the secret, like the other desks' crons. The contract lives in
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleFrontierDailySpinRequest(req, new URL(req.url).origin)
}
