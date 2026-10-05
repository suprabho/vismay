import { serveHtmlStory } from '@vismay/html-stories/serve'

/**
 * An agent-authored HTML story, served as posted (packages/html-stories,
 * migration 085's `html_stories` with app_slug = 'footshorts'), wrapped only in
 * the Footshorts header and footer, over its aura scene when one is set.
 * Public — no AuthGate, unlike the editorial reader — so stories can be shared.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY on this deployment: the table is RLS-locked to
 * the service role. Without it every slug is a 404.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return serveHtmlStory(req, slug, 'footshorts')
}
