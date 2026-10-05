import { handleHtmlStoryBriefRequest } from '@vismay/html-stories/briefApi'

/**
 * The footshorts agent brief as plain markdown, so any agent with web access
 * can be told "read footshorts.com/api/html-stories/brief and write a story
 * about Saturday's match". `?style=random` draws a palette and fonts from the
 * footshorts editorial stories; `?fixtures=<id>,<id>&prompt=…` (with the
 * publish token as a bearer) appends the match context. See briefApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleHtmlStoryBriefRequest(req, 'footshorts')
}
