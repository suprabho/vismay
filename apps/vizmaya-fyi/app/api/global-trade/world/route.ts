import { NextResponse } from 'next/server'
import { getWorldTradeProfile, type TradeSource } from '@vismay/content-source/trade'

export const dynamic = 'force-dynamic'

const SOURCES: TradeSource[] = ['oec', 'comtrade', 'trademap']

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sourceParam = url.searchParams.get('source')
  const source = SOURCES.includes(sourceParam as TradeSource)
    ? (sourceParam as TradeSource)
    : undefined
  const topN = Number(url.searchParams.get('topN')) || undefined

  const profile = await getWorldTradeProfile({ source, topN })
  if (!profile) {
    return NextResponse.json({ error: 'no_data' }, { status: 404 })
  }
  return NextResponse.json(profile, {
    headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
