/**
 * POST /api/vizmaya/sign-story-links
 *
 * Body: { slug: string }
 * Returns: SignedStoryLinks (autoplay, share, report, slides, reports, newsletter)
 *
 * Cookie-gated (admin only). Lets client-side admin UIs that don't have
 * a natural server-render parent (e.g. the social planner's per-post
 * panels) mint signed URLs for vizmaya.fyi without bundling the signing
 * secret into the browser. Minting takes one fetch per slug; tokens are
 * 24h so re-renders within a session don't need to re-fetch.
 *
 * Signing is privileged: the secret stays server-side and any caller has
 * to be a logged-in admin. Same as the GETs on /api/vizmaya/* that this
 * endpoint mirrors in shape.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { signStoryLinks } from '@/lib/signedConsumerLinks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null
  const slug = body?.slug
  if (typeof slug !== 'string' || !SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }
  // TODO: accept a `vertical` field when the planner grows multi-vertical
  // support. Today every social-post slug is a vizmaya story.
  return NextResponse.json(signStoryLinks(slug))
}
