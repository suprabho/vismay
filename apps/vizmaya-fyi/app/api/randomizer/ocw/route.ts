import { handleOcwPoolRequest } from '@vismay/html-stories/randomizerApi'

/**
 * A page of the OCW Desk's pool (the files of one kind under one topic, or
 * in one course, from MIT Learn's API), or the taxonomy without a query:
 * what an OCW spin draws from. Token-gated; see
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleOcwPoolRequest(req)
}
