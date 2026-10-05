import { serveHtmlStory } from '@vismay/html-stories/serve'

/**
 * Serves an agent-authored HTML story as it was posted (migration 085,
 * packages/html-stories), wrapped only in the vizmaya header and footer, over
 * its aura scene when one is set. No React shell, no viz engine: the document
 * is the whole page. The handler itself is shared with footshorts
 * (packages/html-stories/src/serve.ts): CSP sandbox, caching, the 404 page.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return serveHtmlStory(req, slug, 'vizmaya-fyi')
}
