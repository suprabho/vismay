import { handleHtmlStoryPublish } from '@vismay/html-stories/publishApi'

/**
 * The agent publish endpoint for travel HTML stories, `Authorization: Bearer
 * $HTML_STORIES_TOKEN` (set on this deployment), the same contract as every
 * other site's (packages/html-stories/src/publishApi.ts), plus travel's rule:
 * the page names its trip (<meta name="travel:trip">) and its slug starts
 * with the trip's.
 *
 * No public GET listing, unlike the other sites: every travel story is private
 * to its trip. A trip's journey page links its own (lib/htmlStories).
 */

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleHtmlStoryPublish(req, 'travel')
}
