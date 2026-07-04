import { NextResponse } from 'next/server'
import { getTradeWeb, type TradeFlow, type TradeSource } from '@vismay/content-source/trade'

export const dynamic = 'force-dynamic'

const SOURCES: TradeSource[] = ['oec', 'comtrade', 'trademap']

export async function GET(req: Request) {
  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year'))
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return NextResponse.json({ error: 'invalid_year' }, { status: 400 })
  }
  const flowParam = url.searchParams.get('flow')
  const flow: TradeFlow = flowParam === 'import' ? 'import' : 'export'
  const sourceParam = url.searchParams.get('source')
  const source = SOURCES.includes(sourceParam as TradeSource)
    ? (sourceParam as TradeSource)
    : undefined

  const web = await getTradeWeb({ year, flow, source })
  if (!web) {
    return NextResponse.json({ error: 'no_data' }, { status: 404 })
  }
  return NextResponse.json(web, {
    headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
