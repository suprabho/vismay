import { NextRequest, NextResponse } from 'next/server'
import { getLatestDcNewsRecap, listDcNewsRecaps } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// Default: `{ recap }` — the newest daily AI-news recap (null before the
// worker's first run), ready to drop into the landing page. `?limit=N`
// returns `{ recaps }` — the last N snapshots for a timeline view.
export async function GET(req: NextRequest) {
  const rawLimit = Number(req.nextUrl.searchParams.get('limit'))
  const headers = { 'cache-control': 's-maxage=1800, stale-while-revalidate=86400' }
  if (Number.isFinite(rawLimit) && rawLimit > 0) {
    const recaps = await listDcNewsRecaps(Math.min(rawLimit, 60))
    return NextResponse.json({ recaps }, { headers })
  }
  const recap = await getLatestDcNewsRecap()
  return NextResponse.json({ recap }, { headers })
}
