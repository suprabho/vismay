import { loadHomeData } from '@/lib/home/homeData'
import { FRONT_PAGE_LIMIT, formatStoryDate, isHomeStageFormat, storiesForTopic } from '@/lib/home/homeShape'
import { renderHomeStage } from '@/lib/home/renderHomeStage'

/**
 * The home page's front page as a book, a board or a deck: one complete HTML
 * story on the hosted format runtimes, framed by the home page, which swaps
 * between them (lib/home/renderHomeStage.ts). `?topic=` binds only that
 * topic's stories. Not a page of its own, so it stays out of search.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params
  if (!isHomeStageFormat(format)) return new Response('Not found', { status: 404 })

  const topic = new URL(req.url).searchParams.get('topic')?.trim() || null
  const data = await loadHomeData()
  const html = renderHomeStage(format, {
    stories: storiesForTopic(data.stories, topic).slice(0, FRONT_PAGE_LIMIT),
    total: data.stories.length,
    topic,
    epics: data.epics,
    edition: data.dailyEditions[0] ?? null,
    fontUrls: data.fontUrls,
    today: formatStoryDate(new Date().toISOString()),
  })

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
      'X-Robots-Tag': 'noindex',
      // Framed by the home page only.
      'Content-Security-Policy': "frame-ancestors 'self'",
    },
  })
}
