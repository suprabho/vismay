import { loadHomeData } from '@/lib/home/homeData'
import { FRONT_PAGE_LIMIT, formatStoryDate, homeStats, isHomeStageFormat } from '@/lib/home/homeShape'
import { renderHomeStage } from '@/lib/home/renderHomeStage'

/**
 * The whole home page as a book, a board or a deck: one complete HTML story
 * on the hosted format runtimes, framed full-screen by the home page, which
 * swaps between them and its scrolling version (lib/home/renderHomeStage.ts).
 * Not a page of its own, so it stays out of search.
 */

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params
  if (!isHomeStageFormat(format)) return new Response('Not found', { status: 404 })

  const data = await loadHomeData()
  const html = renderHomeStage(format, {
    stories: data.stories.slice(0, FRONT_PAGE_LIMIT),
    total: data.stories.length,
    epics: data.epics,
    editions: data.dailyEditions,
    stats: homeStats(data),
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
