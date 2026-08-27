import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getPipelineEpic, listPipelineNews } from '@vismay/content-source/pipelines'

export const dynamic = 'force-dynamic'

const TOPIC_RE = /^[a-z0-9-]+$/i
// Secondary tags: dc_stocks tickers (NVDA, 2317.TW, 005930.KS, …)
// or ISO country codes (US, CN) depending on the epic.
const TAG_RE = /^[A-Z0-9.-]+$/i
const RELEVANCE = new Set(['all', 'relevant', 'rejected'])
const MAX_Q_LEN = 120

// Merged, epic-tagged news feed across the registered pipelines (`?epic=`
// scopes to one). Per-epic query failures come back in `errors` alongside
// the rows that did load.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const params = req.nextUrl.searchParams

  const rawLimit = Number(params.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50
  const epic = params.get('epic') ?? undefined
  const topic = params.get('topic') ?? undefined
  const tag = params.get('tag') ?? undefined
  const q = params.get('q')?.trim().slice(0, MAX_Q_LEN) || undefined
  const rawRelevance = params.get('relevance') ?? 'relevant'
  if (epic && !getPipelineEpic(epic)) return NextResponse.json({ error: 'unknown epic' }, { status: 400 })
  if (topic && !TOPIC_RE.test(topic)) return NextResponse.json({ error: 'bad topic' }, { status: 400 })
  if (tag && !TAG_RE.test(tag)) return NextResponse.json({ error: 'bad tag' }, { status: 400 })
  if (!RELEVANCE.has(rawRelevance)) return NextResponse.json({ error: 'bad relevance' }, { status: 400 })

  const { news, errors } = await listPipelineNews({
    epic,
    limit,
    topic,
    tag,
    q,
    relevance: rawRelevance as 'all' | 'relevant' | 'rejected',
  })
  return NextResponse.json({ news, errors })
}
