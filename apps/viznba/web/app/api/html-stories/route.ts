import { NextResponse } from 'next/server'
import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories'
import { handleHtmlStoryPublish } from '@vismay/html-stories/publishApi'

/**
 * VizNBA HTML stories (packages/html-stories):
 *
 *   GET  — the published viznba stories (slug, title, description, og:image,
 *          aura, palette, dates) as public JSON. The table is service-role
 *          only, so clients can't read it through the anon Supabase client.
 *   POST — the agent publish endpoint, `Authorization: Bearer
 *          $HTML_STORIES_TOKEN` (set on this deployment), same contract as
 *          vizmaya.fyi's, footshorts.com's and vizf1.com's: see publishApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stories = await listPublishedHtmlStories('viznba')
    return NextResponse.json(
      { stories },
      { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=600' } },
    )
  } catch (e) {
    console.error('[html-stories] listing failed:', e)
    return NextResponse.json({ stories: [] }, { headers: { 'cache-control': 'no-store' } })
  }
}

export async function POST(req: Request) {
  return handleHtmlStoryPublish(req, 'viznba')
}
