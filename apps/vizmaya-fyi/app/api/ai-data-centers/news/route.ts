import { NextRequest, NextResponse } from 'next/server'
import { getDcNews } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const rawLimit = Number(params.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30
  const news = await getDcNews({
    limit,
    topic: params.get('topic') ?? undefined,
    ticker: params.get('ticker') ?? undefined,
  })
  return NextResponse.json(
    { news },
    { headers: { 'cache-control': 's-maxage=1800, stale-while-revalidate=86400' } },
  )
}
