import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listPowerRankingSummaries } from '@vismay/content-source/footshortsPowerRankings'

export const dynamic = 'force-dynamic'

/**
 * List power-ranking snapshots, newest first — metadata only (no `rankings`
 * payload). The tab lazy-loads a snapshot's full list from
 * `/power-rankings/[id]` when it's opened. No POST here: rows are only ever
 * created by the worker's weekly scrape, never from the admin.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const limit = Number(request.nextUrl.searchParams.get('limit')) || undefined
  try {
    const rankings = await listPowerRankingSummaries({ limit })
    return NextResponse.json({ ok: true, rankings })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list power rankings' },
      { status: 500 },
    )
  }
}
