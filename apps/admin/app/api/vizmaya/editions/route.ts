import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listEditionsForAdmin } from '@vismay/content-source/dcEditions'
import { editionPublicUrl } from '@/lib/editionsAdmin'

export const dynamic = 'force-dynamic'

// The archive: every edition (drafts included), newest first, with headline,
// mood score, counts and composer model — read-only.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const rawLimit = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 60
  try {
    const editions = await listEditionsForAdmin(limit)
    return NextResponse.json({
      editions: editions.map((e) => ({ ...e, publicUrl: e.status === 'published' ? editionPublicUrl(e.date) : null })),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'read failed' }, { status: 500 })
  }
}
