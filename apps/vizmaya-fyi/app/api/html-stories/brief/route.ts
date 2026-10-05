import { htmlStoryBrief } from '@vismay/html-stories/brief'

/**
 * The agent brief as plain markdown, so any agent with web access can be told
 * "read vizmaya.fyi/api/html-stories/brief and write a story about X".
 * Public on purpose: it holds no secrets (the publish token is the user's).
 */
export function GET(req: Request) {
  return new Response(htmlStoryBrief({ siteUrl: new URL(req.url).origin }), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, s-maxage=3600',
    },
  })
}
