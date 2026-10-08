import { handleRandomizerSpinRequest } from '@vismay/html-stories/randomizerApi'

/**
 * One randomizer spin: GET it (with its research stub), or PUT
 * `{ research: "<markdown>" }` to save its research file. Token-gated; see
 * packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  return handleRandomizerSpinRequest(req, (await params).id, 'footshorts')
}

export async function PUT(req: Request, { params }: Ctx) {
  return handleRandomizerSpinRequest(req, (await params).id, 'footshorts')
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handleRandomizerSpinRequest(req, (await params).id, 'footshorts')
}
