import { handleEvidencePoolRequest } from '@vismay/html-stories/randomizerApi'

/**
 * The Evidence Desk's pool: the annotated collection of research on social
 * media's effects with its themes, designs and lenses, or with `study`, that
 * study and its live citation record (OpenAlex, Unpaywall) as a spin would
 * read it. Token-gated; see packages/html-stories/src/randomizerApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleEvidencePoolRequest(req)
}
