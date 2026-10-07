import { handleHtmlStoryBriefRequest } from '@vismay/html-stories/briefApi'

/**
 * The VizF1 agent brief as plain markdown, so any agent with web access can be
 * told "read vizf1.com/api/html-stories/brief and write a story about Sunday's
 * race". `?style=random` draws a palette and fonts from the vizf1 editorial
 * stories; `?sessions=<key>,<key>&drivers=VER,NOR&prompt=…` (with the publish
 * token as a bearer) appends the race context: results, laps, telemetry and
 * standings for those sessions and drivers. See briefApi.ts.
 */

export const dynamic = 'force-dynamic'
// Several sessions' laps and telemetry are read to build the race context.
export const maxDuration = 60

export async function GET(req: Request) {
  return handleHtmlStoryBriefRequest(req, 'vizf1')
}
