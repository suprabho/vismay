import { NextRequest, NextResponse } from 'next/server'
import { listEditions } from '@vismay/content-source/dcEditions'

export const dynamic = 'force-dynamic'

// `{ editions: [{number, date, headline, sub, counts, moodScore, publishedAt}] }`
// — the archive rail and the masthead navigator. Newest first; `?limit=N`
// (default 30, max 400) and `?before=YYYY-MM-DD` page backwards.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const rawLimit = Number(params.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 400) : 30
  const before = params.get('before') ?? undefined
  if (before && !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return NextResponse.json({ error: 'bad before' }, { status: 400 })
  }
  const editions = await listEditions(limit, { before })
  return NextResponse.json(
    { editions },
    { headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' } },
  )
}
