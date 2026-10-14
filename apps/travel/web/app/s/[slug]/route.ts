import { htmlStoryNotFound, htmlStoryResponse } from '@vismay/html-stories/serve'
import { isTripAuthed } from '@/lib/gate'
import { getTripHtmlStory } from '@/lib/htmlStories'

/**
 * A trip's agent-authored HTML story (packages/html-stories, `app_slug =
 * 'travel'`), served as posted inside the Trips header and footer under the
 * sandbox CSP, like every site's /s/<slug>, but only to visitors holding the
 * password of the trip the page names (<meta name="travel:trip">): anyone else
 * goes to that trip's login and comes back here. Never cached by the CDN.
 *
 * Unknown, draft and archived slugs are a 404 for everyone. A published
 * story's slug does reveal its trip's (it starts with it), which is the
 * trip's shared link anyway.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const story = await getTripHtmlStory(slug)
  if (!story) return htmlStoryNotFound('travel', { private: true })

  if (!(await isTripAuthed(story.trip))) {
    const login = new URL(`/t/${story.trip}/login`, req.url)
    login.searchParams.set('next', `/s/${slug}`)
    return new Response(null, {
      status: 307,
      headers: { location: login.toString(), 'cache-control': 'private, no-store' },
    })
  }
  return htmlStoryResponse(req, story, 'travel', { private: true })
}
