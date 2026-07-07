/**
 * App-side wrapper around the content-source newsletter render worker.
 *
 * Owns the two pieces content-source stays deliberately decoupled from:
 *   - minting the signed capture URL (admin-core HMAC — the
 *     /story/<slug>/newsletter route is gated by the signed-URL middleware)
 *   - resolving the canonical public story URL for the CTA/footer links.
 *
 * Imports `playwright` transitively, so Node runtime only — the API route
 * dynamic-imports this module exactly like the PDF path.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import {
  renderStoryNewsletter,
  type NewsletterRenderResult,
} from '@vismay/content-source/storyNewsletterRender'
import { SITE_URL } from './jsonLd'

export async function renderStoryNewsletterLocal(args: {
  supabase: SupabaseClient
  slug: string
  baseUrl: string
  force?: boolean
  log?: (msg: string) => void
}): Promise<NewsletterRenderResult> {
  const captureUrl = signOutputUrl({
    baseUrl: args.baseUrl,
    path: `/story/${args.slug}/newsletter`,
    // Cover the whole render: navigation + in-page chart-data fetches while
    // the readiness coordinator settles. Same budget as the PDF renderer.
    ttlSeconds: 14 * 60,
    query: { print: '1' },
  })

  return renderStoryNewsletter({
    supabase: args.supabase,
    slug: args.slug,
    captureUrl,
    storyUrl: `${SITE_URL}/story/${args.slug}`,
    force: args.force,
    log: args.log,
  })
}
