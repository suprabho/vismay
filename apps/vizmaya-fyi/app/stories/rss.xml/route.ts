import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories'
import { htmlStoriesRssResponse } from '@vismay/html-stories/seo'

export const revalidate = 600

/**
 * The feed of agent-authored HTML stories (/s/<slug>) for readers, aggregators
 * and Google News (packages/html-stories/src/seo.ts). Under /stories, the hub
 * it links back to, rather than /editorial, which vizmaya.fyi doesn't have.
 */
export async function GET() {
  const stories = await listPublishedHtmlStories('vizmaya-fyi').catch(() => [])
  return htmlStoriesRssResponse('vizmaya-fyi', stories)
}
