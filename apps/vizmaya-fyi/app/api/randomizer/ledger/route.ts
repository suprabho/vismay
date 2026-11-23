import { handleLedgerPoolRequest } from '@vismay/html-stories/randomizerApi'

/**
 * Ledger's pool: the whole catalogue of past financial crimes with its eras,
 * sectors, typologies and lenses, each case with the era it sits in today
 * and its legal status, or with `case`, that one case as a spin would carry
 * it. Token-gated; see packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleLedgerPoolRequest(req)
}
