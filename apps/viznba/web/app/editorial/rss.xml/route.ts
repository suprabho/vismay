import { htmlStoriesRssResponse } from '@vismay/html-stories/seo'
import { htmlStories } from '@/lib/htmlStories'

export const revalidate = 600

/** The editorial feed for readers, aggregators and Google News (packages/html-stories/src/seo.ts). */
export async function GET() {
  return htmlStoriesRssResponse('viznba', await htmlStories())
}
