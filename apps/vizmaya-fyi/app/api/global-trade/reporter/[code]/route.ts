import { NextResponse } from 'next/server'
import { getReporterTradeProfile, type TradeSource } from '@vismay/content-source/trade'

export const dynamic = 'force-dynamic'

const SOURCES: TradeSource[] = ['oec', 'comtrade', 'trademap']

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const url = new URL(req.url)
  const sourceParam = url.searchParams.get('source')
  const source = SOURCES.includes(sourceParam as TradeSource)
    ? (sourceParam as TradeSource)
    : undefined

  const profile = await getReporterTradeProfile(code, { source })
  if (!profile) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(profile, {
    headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
