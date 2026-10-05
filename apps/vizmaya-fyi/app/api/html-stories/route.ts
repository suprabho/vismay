import { handleHtmlStoryPublish } from '@vismay/html-stories/publishApi'

/**
 * Publish endpoint for agent-authored HTML stories (see the brief in
 * packages/html-stories/src/brief.ts): `Authorization: Bearer
 * $HTML_STORIES_TOKEN`, raw text/html or JSON. The contract lives in
 * packages/html-stories/src/publishApi.ts, shared with footshorts; the admin
 * tab writes through its own session-gated route instead.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleHtmlStoryPublish(req, 'vizmaya-fyi')
}
