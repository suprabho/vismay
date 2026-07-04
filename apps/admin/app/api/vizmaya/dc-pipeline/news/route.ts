import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listDcNewsForAdmin } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

const TOPIC_RE = /^[a-z0-9-]+$/i
// Yahoo home-listing symbols: NVDA, 2330.TW, ASML.AS, 005930.KS, 0981.HK, …
const TICKER_RE = /^[A-Z0-9.-]+$/i
const RELEVANCE = new Set(['all', 'relevant', 'rejected'])
const MAX_Q_LEN = 120

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const params = req.nextUrl.searchParams

  const rawLimit = Number(params.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50
  const topic = params.get('topic') ?? undefined
  const ticker = params.get('ticker') ?? undefined
  const q = params.get('q')?.trim().slice(0, MAX_Q_LEN) || undefined
  const rawRelevance = params.get('relevance') ?? 'relevant'
  if (topic && !TOPIC_RE.test(topic)) return NextResponse.json({ error: 'bad topic' }, { status: 400 })
  if (ticker && !TICKER_RE.test(ticker)) return NextResponse.json({ error: 'bad ticker' }, { status: 400 })
  if (!RELEVANCE.has(rawRelevance)) return NextResponse.json({ error: 'bad relevance' }, { status: 400 })

  try {
    const news = await listDcNewsForAdmin({
      limit,
      topic,
      ticker,
      q,
      relevance: rawRelevance as 'all' | 'relevant' | 'rejected',
    })
    return NextResponse.json({ news })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
