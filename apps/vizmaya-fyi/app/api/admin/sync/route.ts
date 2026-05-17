import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { syncStory, syncAll } from '@/lib/syncToDb'

/**
 * POST /api/admin/sync          — sync all filesystem stories to DB
 * POST /api/admin/sync?slug=foo — sync one story
 *
 * Returns { results: SyncResult[] } with HTTP 207 if any story failed.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const slug = req.nextUrl.searchParams.get('slug')

  if (slug) {
    try {
      const result = await syncStory(slug)
      return NextResponse.json({ results: [result] })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ results: [{ slug, ok: false, charts: 0, error }] }, { status: 500 })
    }
  }

  const results = await syncAll()
  const anyFailed = results.some((r) => !r.ok)
  return NextResponse.json({ results }, { status: anyFailed ? 207 : 200 })
}
