import { handleHtmlStoryBriefRequest } from '@vismay/html-stories/briefApi'

/**
 * The agent brief as plain markdown, so any agent with web access can be told
 * "read vizmaya.fyi/api/html-stories/brief and write a story about X".
 * Public on purpose: it holds no secrets (the publish token is the user's).
 * `?style=random` swaps the house style for a palette and font trio drawn from
 * the published stories' themes. See packages/html-stories/src/briefApi.ts.
 */
export async function GET(req: Request) {
  return handleHtmlStoryBriefRequest(req, 'vizmaya-fyi')
}
