import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifySignedRequest } from '@vismay/admin-core/signedUrl'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * On-demand revalidation for the daily snapshot after a publish.
 *
 * Published editions are static and immutable; this is the one hook that
 * re-renders `/ai-data-centers/daily` (the latest alias) and the edition's
 * own `/ai-data-centers/daily/[date]` (which may have cached a 404 before
 * the freeze). Called by scripts/ai-data-centers/publish-edition.ts and by
 * the admin's Publish now. Auth: the URL is signed with the shared
 * ADMIN_SESSION_SECRET (`signOutputUrl` in @vismay/admin-core) — the same
 * stateless HMAC the gated render routes use. Fails closed without it.
 */
export async function POST(req: NextRequest) {
  const url = req.nextUrl
  if (!verifySignedRequest({ pathname: url.pathname, searchParams: url.searchParams })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const date = url.searchParams.get('date')
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: 'bad date' }, { status: 400 })

  const paths = ['/ai-data-centers/daily', `/ai-data-centers/daily/${date}`, '/ai-data-centers/daily/opengraph-image', `/ai-data-centers/daily/${date}/opengraph-image`, '/sitemap.xml']
  for (const p of paths) revalidatePath(p)
  return NextResponse.json({ ok: true, revalidated: paths, at: new Date().toISOString() })
}
