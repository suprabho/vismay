import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { loadStoryStylePool } from '@vismay/html-stories/storyStyles'
import { pickRandomStyle, type StoryStyle } from '@vismay/html-stories/styles'

/**
 * The agent brief as plain markdown, so any agent with web access can be told
 * "read vizmaya.fyi/api/html-stories/brief and write a story about X".
 * Public on purpose: it holds no secrets (the publish token is the user's).
 *
 * `?style=random` swaps the house style for a palette and font trio drawn from
 * the published stories' themes (packages/html-stories/src/styles.ts). Falls
 * back to the house style if the stories can't be read.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const random = url.searchParams.get('style') === 'random'

  let style: StoryStyle | null = null
  if (random) {
    try {
      style = pickRandomStyle(await loadStoryStylePool())
    } catch (e) {
      console.error('[html-stories/brief] style pool failed', e)
    }
  }

  return new Response(htmlStoryBrief({ siteUrl: url.origin, style }), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // A random brief must differ per request; the house brief is cacheable.
      'cache-control': random ? 'no-store' : 'public, s-maxage=3600',
    },
  })
}
