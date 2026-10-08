import { handleHtmlStoryBriefRequest } from '@vismay/html-stories/briefApi'

/**
 * The VizNBA agent brief as plain markdown, so any agent with web access can be
 * told "read <site>/api/html-stories/brief and write a story about last
 * night's game". `?style=random` draws a palette and fonts from the viznba
 * stories; `?games=<espn id>,<espn id>&prompt=…` (with the publish token as a
 * bearer) appends the game context: ESPN box scores for those games;
 * `?spin=<id>` writes it for an NBA Desk spin. See briefApi.ts.
 */

export const dynamic = 'force-dynamic'
// Up to a dozen box scores are read from ESPN to build the game context.
export const maxDuration = 60

export async function GET(req: Request) {
  return handleHtmlStoryBriefRequest(req, 'viznba')
}
