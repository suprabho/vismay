import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories'
import { htmlStoriesRssResponse } from '@vismay/html-stories/seo'

export const revalidate = 600

/** The editorial feed for readers, aggregators and Google News (packages/html-stories/src/seo.ts). */
export async function GET() {
  const stories = await listPublishedHtmlStories('vizf1').catch(() => [])
  return htmlStoriesRssResponse('vizf1', stories)
}
