import { NextResponse } from 'next/server'
import { listPublishedHtmlStories } from '@vismay/html-stories/htmlStories'
import { handleHtmlStoryPublish } from '@vismay/html-stories/publishApi'

/**
 * Footshorts HTML stories (packages/html-stories):
 *
 *   GET  — the published footshorts stories as the Editorial tab lists them
 *          (slug, title, description, og:image, aura, palette, dates). Public
 *          JSON; the table is service-role only, so the client can't read it
 *          through the anon Supabase client the way it reads `stories`.
 *          The mobile app's magazine reads it from footshorts.com as well.
 *   POST — the agent publish endpoint, `Authorization: Bearer
 *          $HTML_STORIES_TOKEN` (set on this deployment), same contract as
 *          vizmaya.fyi's: see publishApi.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stories = await listPublishedHtmlStories('footshorts')
    return NextResponse.json(
      { stories },
      {
        headers: {
          'cache-control': 'public, s-maxage=60, stale-while-revalidate=600',
          // The mobile app's magazine reads this too (its Expo web build cross-origin).
          'access-control-allow-origin': '*',
        },
      },
    )
  } catch (e) {
    console.error('[html-stories] listing failed:', e)
    return NextResponse.json({ stories: [] }, { headers: { 'cache-control': 'no-store' } })
  }
}

export async function POST(req: Request) {
  return handleHtmlStoryPublish(req, 'footshorts')
}
