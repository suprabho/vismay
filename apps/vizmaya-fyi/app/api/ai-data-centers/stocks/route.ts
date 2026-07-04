import { NextRequest, NextResponse } from 'next/server'
import { getDcStockMarket } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const rawDays = Number(req.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 730) : 90
  const stocks = await getDcStockMarket(days)
  return NextResponse.json(
    { days, stocks },
    { headers: { 'cache-control': 's-maxage=1800, stale-while-revalidate=86400' } },
  )
}
